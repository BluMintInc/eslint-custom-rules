import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

/**
 * A class member spelled as a field (`isNotReady = () => ...`, `isNotReady =
 * false`) is the same member as its method twin (`isNotReady() { ... }`) as far
 * as a reader is concerned: only the token between the name and the value
 * differs. The rule judges names, so both spellings must answer identically.
 * Abstract members are the declaration-only form of the same two spellings.
 *
 * Every invalid case asserts an exact error count, because the
 * `ArrowFunctionExpression`/`FunctionExpression`/`Identifier` visitors also
 * traverse a field's value and could double-report the same member.
 */
ruleTesterTs.run(
  'enforce-positive-naming-class-property',
  enforcePositiveNaming,
  {
    valid: [
      // Positively-named counterparts of every reported spelling below.
      'class Session { isReady = () => { return true; }; }',
      'class Session { isReady = false; }',
      'class Session { private readonly shouldRetry: boolean = true; }',
      'class Session { public isAdmin = (user: User) => user.admin; }',
      'class Session { static isReady = true; }',
      'class Session { isReady!: boolean; }',
      'abstract class Session { abstract isAdmin(): boolean; }',
      'abstract class Session { abstract isReady: boolean; }',
      'abstract class Session { protected abstract shouldRetry(): boolean; }',

      // Exception words keep their carve-out in field position, exactly as in
      // method position: the "dis"/"in" here is a bound morpheme, not a negation.
      'class Session { isDisabled = false; }',
      'class Session { isDisplayed = false; }',
      'class Session { isIndexed = false; }',
      'class Session { isDisplayName = "primary"; }',
      'class Session { isDismissed = () => { return true; }; }',

      // The #1692 validator carve-out: an `is`-prefixed value that is not a
      // boolean keeps its domain-correct negated name. A field must be exempt
      // on exactly the grounds a method is.
      `class Form {
  isNotBlank = (value?: string) => (value?.trim() ? true : 'Must not be blank');
}`,
      'class Form { isNotBlank = (value?: string) => validate(value); }',
      // Declaration-only spellings carry their return shape solely in the
      // annotation, which must be read for the same carve-out.
      'class Form { isNotBlank!: (value?: string) => string | true; }',
      'abstract class Form { abstract isNotBlank(value?: string): string | true; }',
      // No annotation and no body: nothing syntactic proves a boolean, so the
      // rule prefers a false negative (the repository's stated trade-off).
      'abstract class Form { abstract isNotBlank(value?: string); }',

      // A computed key references a name bound elsewhere, where the rule
      // already judges it; blaming the class member would report the wrong
      // declaration site.
      'class Session { [isNotReady] = false; }',
      'class Session { ["isNotReady"] = false; }',
      'abstract class Session { abstract [isNotReady]: boolean; }',
      'class Session { [isNotReady]() { return true; } }',

      // An overload signature declares the same predicate its implementation
      // defines, so the carve-out must read the signature's return annotation
      // rather than treating a body-less function as proof of a boolean.
      `class Form {
  isNotBlank(value: string): string;
  isNotBlank(value: unknown): unknown {
    return value;
  }
}`,

      // A `declare` field restates the type of a member owned by a base class
      // or an ambient declaration, so its name is not this class's to choose.
      'class Session extends Base { declare isNotReady: boolean; }',
      'class Session extends Base { declare readonly hasNoAccess: boolean; }',

      // A `#private` name is invisible outside the class; the rule skips
      // non-Identifier keys, so the field spelling matches the method spelling.
      'class Session { #isNotReady = false; }',

      // Names with no boolean prefix are outside the rule's subject.
      'class Session { readyState = "idle"; }',
      'class Session { notes = "none"; }',

      // Empty and member-less classes must not crash the added visitors.
      'class Session {}',
      'abstract class Session {}',

      // Config/rc files are skipped wholesale, field spellings included.
      {
        code: 'class Session { isNotReady = false; }',
        filename: 'jest.config.ts',
      },
      {
        code: 'class Session { isNotReady = false; }',
        filename: '.eslintrc.ts',
      },
    ],
    invalid: [
      // The reported bug: the class-property arrow spelling of a method the
      // rule already flags.
      {
        code: `class Roles {
  isNotAdmin = (user: User) => {
    return user.role !== 'admin';
  };
}`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotAdmin', alternatives: 'isAdmin' },
          },
        ],
      },
      // Concise-body arrow.
      {
        code: 'class Roles { isNotAdmin = (user: User) => !user.admin; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      // Anonymous function-expression value.
      {
        code: 'class Roles { isNotAdmin = function (user: User) { return !user.admin; }; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      // Async arrow: the method spelling reports the same name, so the field
      // spelling must too.
      {
        code: 'class Roles { isNotAdmin = async (user: User) => { return !user.admin; }; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },

      // Accessibility and `static` modifiers change nothing about the name.
      {
        code: 'class Roles { public isNotAdmin = (user: User) => !user.admin; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'class Roles { private isNotAdmin = (user: User) => !user.admin; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'class Roles { protected isNotAdmin = (user: User) => !user.admin; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'class Roles { static isNotAdmin = (user: User) => !user.admin; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'class Roles { public static readonly isNotAdmin = (user: User) => !user.admin; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },

      // Data-valued boolean fields: a boolean literal initializer and an
      // explicit `boolean` annotation are both documented detection criteria,
      // and `let isNotReady = false` is already reported in variable position.
      {
        code: 'class Flags { isNotReady = false; }',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotReady', alternatives: 'isReady' },
          },
        ],
      },
      {
        code: 'class Flags { private readonly shouldNotRetry: boolean = true; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'class Flags { hasNoAccess = true; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'class Flags { canNotEdit = () => false; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      // Definite-assignment field: no initializer, annotation is boolean.
      {
        code: 'class Flags { isNotReady!: boolean; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      // Optional field.
      {
        code: 'class Flags { isNotReady?: boolean; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },

      // Abstract members are unregistered node kinds of their own.
      {
        code: 'abstract class Roles { abstract isNotAdmin(): boolean; }',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotAdmin', alternatives: 'isAdmin' },
          },
        ],
      },
      {
        code: 'abstract class Flags { abstract isNotReady: boolean; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'abstract class Roles { protected abstract shouldNotRetry(): boolean; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: 'abstract class Roles { public abstract isNotAdmin(): boolean; }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },

      // One report per member: two fields yield exactly two.
      {
        code: `class Flags {
  isNotReady = false;
  isNotAdmin = (user: User) => !user.admin;
}`,
        errors: [
          { messageId: 'avoidNegativeNaming' },
          { messageId: 'avoidNegativeNaming' },
        ],
      },
      // Method and field spellings of the same class each report once.
      {
        code: `class Roles {
  isNotAdmin(user: User) {
    return !user.admin;
  }
  isNotReady = false;
}`,
        errors: [
          { messageId: 'avoidNegativeNaming' },
          { messageId: 'avoidNegativeNaming' },
        ],
      },
      // A named function expression binds a second identifier inside its own
      // body, so both negatively-named declarations are reported — one for the
      // field, one for the function's own name.
      {
        code: 'class Roles { isNotAdmin = function isNotAdminInner() { return true; }; }',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotAdmin', alternatives: 'isAdmin' },
          },
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotAdminInner', alternatives: 'isAdminInner' },
          },
        ],
      },
      // A positively-named field holding a negatively-named function
      // expression still reports only the function's own name.
      {
        code: 'class Roles { isAdmin = function isNotAdminInner() { return true; }; }',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotAdminInner', alternatives: 'isAdminInner' },
          },
        ],
      },

      // Getter/setter spellings (already-registered `MethodDefinition`) must
      // keep reporting exactly once alongside the added visitors.
      {
        code: 'class Session { get isNotReady() { return true; } }',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },

      // An explicitly annotated validator field keeps its exemption while a
      // plain boolean field beside it reports: the exact count is what proves
      // the carve-out reads the annotation rather than staying silent by luck.
      {
        code: `class Form {
  isNotBlank = (value?: string): string | true => validate(value);
  isNotReady = false;
}`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotReady', alternatives: 'isReady' },
          },
        ],
      },

      // The negative control for the overload carve-out above: a signature
      // annotated `boolean` is proven boolean and still reports, once.
      {
        code: `class Session {
  isNotReady(): boolean;
  isNotReady(): unknown {
    return true;
  }
}`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotReady', alternatives: 'isReady' },
          },
        ],
      },

      // A field of a class expression, and of a class nested inside a function,
      // reaches the same visitor.
      {
        code: 'const Roles = class { isNotAdmin = (user: User) => !user.admin; };',
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
      {
        code: `function build() {
  class Flags {
    isNotReady = false;
  }
  return Flags;
}`,
        errors: [{ messageId: 'avoidNegativeNaming' }],
      },
    ],
  },
);
