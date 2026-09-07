/**
 * On Git Bash (MSYS2) the SHELL resolves `/tmp` through MSYS's mount table
 * while a native Windows child resolves the same literal against the current
 * drive as `C:\tmp\`. So a redirect writes a file the shell can `cat` and
 * report a byte count for, and a `node`/`python` child reading the identical
 * string dies one command later — `ENOENT … 'C:\tmp\body.json'` or
 * `MODULE_NOT_FOUND` — naming a path nobody typed, which is what makes the
 * error read as a corrupt payload rather than as two processes disagreeing
 * about where `/tmp` is.
 *
 * What decides it is POSITION. This flags the code-string position alone: a
 * shell-consumed sink (`> /tmp/out.txt` … `cat /tmp/out.txt`) and an argv path
 * (`jq … /tmp/x.json`) both resolve correctly and stay undetected, which is
 * deliberate — the expensive misreading of this rule is the over-correction.
 *
 * Line-based rather than parsed, because what an agent types is shell rather
 * than a program. The residue that leaves is a path reaching the code string
 * through a SHELL VARIABLE, where no `/tmp` literal sits in the child's code
 * for any line scan to match. Bounded by doctrine, never by this file.
 */

/** Which spelling put the `/tmp` literal inside the child's own code. */
const UNREADABLE_TMP_SHAPE_VALUES = ['read-call', 'interpreter-body'] as const;
export type UnreadableTmpShape = typeof UNREADABLE_TMP_SHAPE_VALUES[number];

/**
 * A `/tmp` ROOTED at the filesystem root, as opposed to the tail of some longer
 * path. The distinction is the whole difference between the defect and its
 * remedy: `.claude/tmp/<scope>/x` ends in the same four characters and is
 * precisely what this file exists to steer authors toward, so a substring test
 * would flag every fixed site as broken.
 */
const ROOT_TMP = /(?:^|[^\w./-])\/tmp(?:[\s"')/;\]`]|$)/;

/**
 * A `/tmp` literal in the ARGUMENT position of a call — `require('/tmp/x')`,
 * `readFileSync("/tmp/x")`, `json.load(open('/tmp/x'))`.
 *
 * The callee must ABUT its parenthesis, which is what keeps ordinary prose out:
 * a markdown parenthetical always carries a space before its `(`, and a JSON
 * field carries a colon rather than one. The quote root-anchors the family for
 * free, since a quote is not a path character. Whitespace between the
 * parenthesis and the quote is tolerated, because `require( '/tmp/x' )` reads
 * identically to the abutting spelling for the child that runs it.
 *
 * The whole quoted argument is matched, and the root anchor is a LOOKAHEAD so
 * it consumes none of it: the match is what {@link classifyUnreadableTmpShape}
 * publishes as the span a caller extracts paths from, and a match stopping one
 * character past `/tmp` would yield a bare `/tmp` for every read call. Global,
 * because a line carrying two read calls hands the child two paths and a remedy
 * naming one of them reads as complete while the other still breaks.
 */
const READ_CALL =
  /\b[$A-Z_a-z][\w$.]*\(\s*(["'`])\/tmp(?=["'/`]|$)(?:(?!\1).)*\1?/g;

/**
 * An inline interpreter body — `node -e …`, `python3 -c …` — carrying a rooted
 * `/tmp`. The backstop for a code string whose `/tmp` sits outside any
 * recognizable call.
 *
 * The match STOPS at the body's closing quote, which is what confines it to the
 * child's own code. Slicing at the end of the FLAG instead would take the rest
 * of the line with it, so a redirect sharing a line with any `node -e` would
 * match — flagging the positions this file exists to leave alone.
 *
 * The flag must IMMEDIATELY follow the interpreter, so a script's own `-c`
 * option (`python3 render.py -c /tmp/config.json`, an argv path and therefore
 * benign) never matches.
 */
const INTERPRETER_BODY =
  /\b(?:node|python3?|perl|ruby|deno|bun|tsx)\s+(?:-e|--eval|-c|-p|--print)\b\s*(["'])(?:(?!\1).)*\1/;

/**
 * The families, in the order they are tried, each reporting the SPAN of the
 * line it claims — the region the child parses as its own code — or `undefined`
 * for no match. A typed table rather than a chain of `if`s because it is what
 * pins the return type WITHOUT an annotation: an explicit
 * `: UnreadableTmpShape | undefined` is what this repo's lint strips on sight,
 * and the resulting widening to `string` type-checks inside this file while
 * breaking every caller that reads the union.
 */
const SHAPES: readonly {
  readonly shape: UnreadableTmpShape;
  readonly span: (text: string) => string | undefined;
}[] = [
  {
    shape: 'read-call',
    span: (text) => {
      return text.match(READ_CALL)?.join('\n');
    },
  },
  {
    shape: 'interpreter-body',
    span: (text) => {
      const interpreter = INTERPRETER_BODY.exec(text);
      /**
       * Testing the whole match is equivalent to testing the body alone: the
       * prefix it adds is the interpreter, the flag and the opening quote, none
       * of which can carry a `/tmp`.
       */
      return interpreter !== null && ROOT_TMP.test(interpreter[0])
        ? interpreter[0]
        : undefined;
    },
  },
];

/**
 * Which spelling, if any, hands this ONE line's `/tmp` literal to a child to
 * resolve, with the SPAN of the line that spelling claims — `undefined` for
 * every line the shell or an argv rewrite resolves.
 *
 * The span is what makes a caller's path extraction position-aware without a
 * second copy of the position table: a benign `/tmp` elsewhere on the same
 * `&&`-compound line sits outside it.
 */
export const classifyUnreadableTmpShape = (text: string) => {
  /** Skipping this first keeps the scan cheap over input that is overwhelmingly
   * ordinary shell. */
  if (!ROOT_TMP.test(text)) {
    return;
  }
  return SHAPES.flatMap(({ shape, span }) => {
    const claimed = span(text);
    return claimed === undefined ? [] : [{ shape, span: claimed }];
  })[0];
};
