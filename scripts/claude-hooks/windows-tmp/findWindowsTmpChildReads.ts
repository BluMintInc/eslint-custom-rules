import { classifyUnreadableTmpShape } from './classifyUnreadableTmpShape';

/**
 * A `/tmp` ROOTED at the filesystem root, plus the path hanging off it. The
 * leading class is what keeps `.claude/tmp/<scope>/x` — the remedy — from
 * matching as the defect it replaces, and the trailing one keeps `df /tmpfs`
 * from publishing a spurious `/tmp` nobody typed. The segment class admits an
 * interpolated segment, since a path truncated at the `$` names a sink the
 * command never used.
 */
const ROOT_TMP_PATH = /(?:^|[^\w./-])(\/tmp(?:\/[\w$%+.=@{}~-]+)*)(?![\w.-])/g;

/**
 * Every line of one Bash command that hands a `/tmp` literal to a child process
 * to resolve for ITSELF, each with EVERY distinct rooted `/tmp` path that
 * line's child code carries, `line` 1-indexed.
 *
 * Line-scoped rather than command-scoped, and the paths come from the
 * classifier's SPAN rather than from the line, for one reason: the capture
 * idiom puts the redirect and the read in one command — often on one `&&`
 * line — and a remedy naming the redirect's own path prescribes exactly the
 * over-correction the deny's benign-positions paragraph exists to prevent.
 */
export function findWindowsTmpChildReads(command: string) {
  return command.split('\n').flatMap((text, index) => {
    const classified = classifyUnreadableTmpShape(text);
    if (classified === undefined) {
      return [];
    }
    return [
      {
        line: index + 1,
        shape: classified.shape,
        paths: extractRootTmpPaths(classified.span),
      },
    ];
  });
}

/** One offending line, as the deny builder consumes it. */
export type WindowsTmpOffense = ReturnType<
  typeof findWindowsTmpChildReads
>[number];

/** The distinct rooted `/tmp` paths in one span, in the order they appear. */
function extractRootTmpPaths(span: string) {
  const found = [...span.matchAll(ROOT_TMP_PATH)].flatMap((match) => {
    const [, path] = match;
    return typeof path === 'string' ? [path] : [];
  });
  return [...new Set(found)];
}
