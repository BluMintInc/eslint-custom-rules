import type { TSESLint } from '@typescript-eslint/utils';

import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

/**
 * A class field holding a boolean-returning function is the method spelling with
 * one extra token, so it carries the same naming obligation (#2159). The message
 * is asserted as TEXT rather than by messageId so the two spellings are pinned to
 * identical guidance: a report on `accountLocked = (): boolean => …` must read
 * exactly like the report on `accountLocked(): boolean { … }`.
 *
 * Booleanness is read from the DECLARED return annotation only, matching what
 * the method arm requires. An un-annotated arrow whose body merely looks boolean
 * stays silent here because its method counterpart is silent, and the fixtures
 * below pin both halves of that symmetry.
 *
 * Fixtures that would otherwise be `valid` but carry an explicit return
 * annotation live in `invalid`, paired with one reporting member and an EXACT
 * error count: the annotation draws a documented partner rule's report, and a
 * `valid` fixture that does so moves a pinned cross-rule count.
 */

const defaultPrefixes =
  'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts';

type MessageArgs = {
  type: string;
  name: string;
  capitalizedName: string;
  prefixes: string;
};

const buildMessage = ({ type, name, capitalizedName, prefixes }: MessageArgs) =>
  `Boolean ${type} "${name}" is missing a common approved boolean prefix (${prefixes}). ` +
  `Prefixes immediately communicate that the value is a true/false predicate; without one, checks like \`if (${name})\` read as generic truthiness guards and hide the boolean intent. ` +
  `Rename by prepending any approved prefix so the name becomes \`<prefix>${capitalizedName}\`, making the boolean contract obvious at call sites and API boundaries.`;

const buildError = (
  args: MessageArgs,
): TSESLint.TestCaseError<'missingBooleanPrefix'> =>
  ({
    message: buildMessage(args),
  } as unknown as TSESLint.TestCaseError<'missingBooleanPrefix'>);

const methodError = (name: string, capitalizedName: string) =>
  buildError({
    type: 'method',
    name,
    capitalizedName,
    prefixes: defaultPrefixes,
  });

const propertyError = (name: string, capitalizedName: string) =>
  buildError({
    type: 'property',
    name,
    capitalizedName,
    prefixes: defaultPrefixes,
  });

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-class-property-function',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // An un-annotated arrow is silent in BOTH spellings: the method
      // counterpart `accountLocked() { return this.failedAttempts > 3; }`
      // reports nothing, so reading booleanness out of the body here would make
      // the spellings disagree in the opposite direction.
      `class UserAccount { accountLocked = () => this.failedAttempts > 3; }`,
      `class UserAccount { accountLocked = () => true; }`,
      `class UserAccount { accountLocked = () => !this.disabled; }`,
      `class UserAccount { accountLocked = () => this.attempts === 0; }`,
      `class UserAccount { accountLocked = function () { return true; }; }`,
      `class UserAccount { accountLocked = () => { return this.failedAttempts > 3; }; }`,
      // The method arm's type-predicate carve-out reaches the field spelling by
      // construction: a predicate annotation is not the boolean keyword.
      `class Guards { valid = (value: unknown): value is string => typeof value === 'string'; }`,
      `class Guards { valid = (value: unknown): asserts value is string => { void value; }; }`,
      // An ambient field declares a shape provided elsewhere, so the
      // declaration site does not own the name.
      `class UserAccount { declare accountLocked: () => boolean; }`,
      `class UserAccount { declare static accountLocked: () => boolean; }`,
      // Fields holding data keep behaving exactly as before.
      `class UserAccount { isDone = false; }`,
      `class UserAccount { hasAccess = true; }`,
      `class UserAccount { failedAttempts = 3; }`,
      `class UserAccount { label = 'locked'; }`,
      `
class UserAccount {
  isAccountLocked: boolean;
  constructor() {
    this.isAccountLocked = false;
  }
}
`,
      // A field holding a non-function value that merely mentions a boolean
      // stays a data field.
      `class UserAccount { accountLocked = this.failedAttempts > 3; }`,
      // Callbacks that answer nothing are untouched.
      `class Widget { handleClick = () => { this.open(); }; }`,
    ],
    invalid: [
      // The issue's reproduction: the docs' own "incorrect code" example
      // respelled as a class-property arrow.
      {
        code: `
class UserAccount {
  accountLocked = (): boolean => {
    return this.failedAttempts > 3;
  };
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // The corpus evidence pair: an ECMA private field (#1935 established that
      // `#` members are in scope) reports under its written spelling.
      {
        code: `class UserAccount { #locked = (): boolean => { return true; }; }`,
        errors: [methodError('#locked', 'Locked')],
      },
      {
        code: `class UserAccount { static #locked = (): boolean => true; }`,
        errors: [methodError('#locked', 'Locked')],
      },
      // Expression-bodied arrow, the shortest spelling of the same member.
      {
        code: `class UserAccount { accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // Every accessibility modifier reaches the same report.
      {
        code: `class UserAccount { public accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        code: `class UserAccount { private accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        code: `class UserAccount { protected accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        code: `class UserAccount { static accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        code: `class UserAccount { readonly accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        code: `class UserAccount { protected static readonly accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // A function expression declares the same contract as an arrow.
      {
        code: `class UserAccount { accountLocked = function (): boolean { return true; }; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // A named function expression whose own name is prefixed draws exactly one
      // report — the field's — so the arm cannot double-report one member.
      {
        code: `class UserAccount { accountLocked = function isLocked(): boolean { return true; }; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // Two unprefixed names means two reports, on two different names, from two
      // different arms.
      {
        code: `class UserAccount { accountLocked = function lockedInner(): boolean { return true; }; }`,
        errors: [
          methodError('accountLocked', 'AccountLocked'),
          buildError({
            type: 'function',
            name: 'lockedInner',
            capitalizedName: 'LockedInner',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      // Parentheses around the value are not an AST node, so the arm still sees
      // the arrow.
      {
        code: `class UserAccount { accountLocked = ((): boolean => true); }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // Type parameters and an async-free generic signature change nothing.
      {
        code: `class UserAccount { accountLocked = <T,>(value: T): boolean => Boolean(value); }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // A class expression nested in a function is reached the same way.
      {
        code: `function build() { return class { accountLocked = (): boolean => true; }; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // An abstract class body is an ordinary body for concrete fields.
      {
        code: `abstract class UserAccount { protected accountLocked = (): boolean => true; }`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // Both spellings side by side must give identical guidance, once each.
      {
        code: `
class UserAccount {
  accountLocked(): boolean {
    return this.failedAttempts > 3;
  }
  sessionActive = (): boolean => this.session !== undefined;
}
`,
        errors: [
          methodError('accountLocked', 'AccountLocked'),
          methodError('sessionActive', 'SessionActive'),
        ],
      },
      // ISOLATION CONTROLS. Each class holds one member the arm must report and
      // one it must leave alone, and the exact error count is what proves the
      // second member stayed silent.
      {
        // An approved prefix on the field arrow is respected.
        code: `
class UserAccount {
  isAccountLocked = (): boolean => true;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A leading underscore is approved, as everywhere else in this rule.
        code: `
class UserAccount {
  _accountLocked = (): boolean => true;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A non-boolean return annotation is not this rule's business.
        code: `
class UserAccount {
  accountLabel = (): string => 'locked';
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A union that merely CONTAINS boolean is not the boolean keyword, and
        // the method spelling reads it the same way.
        code: `
class UserAccount {
  accountPending = (): boolean | undefined => undefined;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // `Promise<boolean>` is not the boolean keyword either.
        code: `
class UserAccount {
  accountChecking = async (): Promise<boolean> => true;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A computed key's static name belongs to the expression holding it, so
        // renaming it would rename nothing on the class.
        code: `
declare const key: string;
class UserAccount {
  [key] = (): boolean => true;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // An ambient field declaration is exempt even when its type declares a
        // boolean-returning function.
        code: `
class UserAccount {
  declare accountPending: () => boolean;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // Object literal property names stay carved out, in both spellings.
        code: `
class UserAccount {
  handlers = { active: (): boolean => true, ready(): boolean { return true; } };
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A string-literal key carries no renameable identifier, so the arm
        // passes over it even though the value declares a boolean return.
        code: `
class UserAccount {
  'account-locked' = (): boolean => true;
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A standalone object literal is out of scope in both spellings; the
        // class member beside it is the only report.
        code: `
const handlers = { active(): boolean { return true; } };
class UserAccount {
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      {
        // A type predicate on the field arrow keeps the method arm's carve-out.
        code: `
class UserAccount {
  valid = (value: unknown): value is string => typeof value === 'string';
  accountLocked = (): boolean => true;
}
`,
        errors: [methodError('accountLocked', 'AccountLocked')],
      },
      // The annotation and literal paths this arm sits in front of are
      // undisturbed: both still report as a PROPERTY.
      {
        code: `class UserAccount { locked: boolean; }`,
        errors: [propertyError('locked', 'Locked')],
      },
      {
        code: `class UserAccount { done = false; }`,
        errors: [propertyError('done', 'Done')],
      },
      {
        // A field satisfying both the function arm and the annotation path draws
        // exactly one report, not two.
        code: `class UserAccount { locked: boolean = (): boolean => true; }`,
        errors: [methodError('locked', 'Locked')],
      },
      // The configured prefix list is honoured on this arm too.
      {
        code: `
class UserAccount {
  canAccountLocked = (): boolean => true;
  isAccountLocked = (): boolean => true;
}
`,
        options: [{ prefixes: ['can'] }],
        errors: [
          buildError({
            type: 'method',
            name: 'isAccountLocked',
            capitalizedName: 'IsAccountLocked',
            prefixes: 'can',
          }),
        ],
      },
      {
        // The underscore exemption survives a custom prefix list: the count
        // proves only the plain member reports.
        code: `
class UserAccount {
  _accountLocked = (): boolean => true;
  accountLocked = (): boolean => true;
}
`,
        options: [{ prefixes: ['is', 'has'] }],
        errors: [
          buildError({
            type: 'method',
            name: 'accountLocked',
            capitalizedName: 'AccountLocked',
            prefixes: 'is, has',
          }),
        ],
      },
    ],
  },
);
