/**
 * The injectable platform signal. The SHIM is the sole detector: it resolves
 * the platform in bash — where `$OSTYPE` is readable, which it is not from a
 * child process — assigns a verdict on every branch, exits unless that verdict
 * is Git Bash, and exports it here. Tests set it directly to exercise both arms
 * from any host.
 *
 * One variable, shared by both Git-Bash-gated shims: each exports it into its
 * own checker, so there is one platform question with one answer rather than a
 * second detector to drift against.
 */
export const MSYS_GUARD_PLATFORM_ENV = 'BLUMINT_MSYS_GUARD_PLATFORM' as const;

/** The one value of {@link MSYS_GUARD_PLATFORM_ENV} that arms a guard. */
export const GIT_BASH_PLATFORM = 'git-bash' as const;

/**
 * Whether the shell that would run a Bash tool call is Git Bash (MSYS2) — the
 * one environment where MSYS2's argument conversion rewrites path-shaped argv
 * before a native Windows program's `main` sees it.
 *
 * The gate exists because the REFUSAL is platform-specific even though the
 * REMEDY is not. `MSYS_NO_PATHCONV=1` is a verified no-op on Linux and macOS,
 * so prescribing it unconditionally is right; denying a working command on two
 * of three platforms is new friction with no bug to prevent — including on the
 * Linux box this repo's own maintainer loop runs on.
 *
 * Reads the shim's exported verdict and nothing else. A second detector here
 * would be a second owner of one invariant, and an ambient `MSYSTEM` is not a
 * second opinion: a checker reached without the verdict holds no opinion, which
 * is this guard's own prescribed fail-open direction.
 */
export function detectGitBash(env: Record<string, string | undefined>) {
  return env[MSYS_GUARD_PLATFORM_ENV] === GIT_BASH_PLATFORM;
}
