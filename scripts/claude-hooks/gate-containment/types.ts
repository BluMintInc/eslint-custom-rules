/**
 * One denied invocation and the command to publish back.
 *
 * **`rewrite` is a command this guard itself ALLOWS**, and
 * `.claude/hooks/gate-containment-guard.test.mjs` feeds every published rewrite
 * back through the real checker to hold that. A `PreToolUse:Bash` deny reason
 * frequently never reaches the agent, so the retry is made blind, and it only
 * converges while the fixed point holds.
 *
 * A discriminated union rather than one shape with an optional `names`: only
 * the environment rule has variables to enumerate, and an optional list would
 * let the deny builder read `undefined` where it must print a list.
 */
export type GateContainmentOffense =
  | { readonly rule: 'whole-suite'; readonly rewrite: string }
  | {
      readonly rule: 'governor-environment';
      readonly rewrite: string;
      /** Every governor-family name the rewrite removed. Named in full, since a
       * remedy naming one of several still strips the rest while reading as
       * complete. */
      readonly names: readonly string[];
    };
