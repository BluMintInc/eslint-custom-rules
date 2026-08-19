import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreRulesGetAccess } from '../rules/enforce-firestore-rules-get-access';

ruleTesterTs.run(
  'enforce-firestore-rules-get-access',
  enforceFirestoreRulesGetAccess,
  {
    valid: [
      // Basic good patterns
      {
        code: 'const rules = "allow read: if resource.data.get(\'fieldX\', null) != null;";',
      },
      {
        code: "const rules = \"allow update: if request.resource.data.get('fieldX', null).get('fieldY', null) != null;\";",
      },
      // Using other comparisons but with get
      {
        code: 'const rules = "allow read: if resource.data.get(\'flag\', false) == true;";',
      },
      // No Firestore pattern in string
      { code: "const s = 'resource.dataset.field != null';" },
      // Template literal without violations
      {
        code: "const rules = `allow read: if resource.data.get('fieldX', null) != null;`;",
      },
      // Mentioning data but not direct compare to null/undefined
      {
        code: 'const rules = "allow read: if resource.data.get(\'fieldX\', null) == 5;";',
      },
      // Ensure not flagging when both segments use get with defaults
      {
        code: "const rules = \"allow read: if request.resource.data.get('user', null).get('name', null) != null;\";",
      },
    ],
    invalid: [
      // Basic: direct nested access
      {
        code: 'const rules = "allow read: if resource.data.fieldX.fieldY != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('fieldX', null).get('fieldY', null) != null;\";",
      },
      // request.resource variant
      {
        code: 'const rules = "allow update: if request.resource.data.fieldX.fieldY != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow update: if request.resource.data.get('fieldX', null).get('fieldY', null) != null;\";",
      },
      // Single-level property
      {
        code: 'const rules = "allow read: if resource.data.fieldX == null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules = "allow read: if resource.data.get(\'fieldX\', null) == null;";',
      },
      // Using === and !== operators
      {
        code: 'const rules = "allow read: if resource.data.foo.bar === null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('foo', null).get('bar', null) === null;\";",
      },
      {
        code: 'const rules = "allow read: if resource.data.foo.bar !== undefined;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('foo', null).get('bar', null) !== undefined;\";",
      },
      // Parentheses around expression
      {
        code: 'const rules = "allow read: if (resource.data.user.name != null);";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if (resource.data.get('user', null).get('name', null) != null);\";",
      },
      // Extra whitespace
      {
        code: 'const rules = "allow read: if resource.data.user.name    !=    null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('user', null).get('name', null)    !=    null;\";",
      },
      // Multiple occurrences in one string (we apply all fixes at once but still report once)
      {
        code: 'const rules = "allow read: if resource.data.a.b != null && request.resource.data.x.y == null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('a', null).get('b', null) != null && request.resource.data.get('x', null).get('y', null) == null;\";",
      },
      // Template literal (no auto-fix)
      {
        code: 'const rules = `allow read: if resource.data.user.name != null;`;',
        errors: [{ messageId: 'useGetAccess' }],
      },
      // Missing default in get()
      {
        code: 'const rules = "allow read: if resource.data.get(\'fieldX\') != null;";',
        errors: [{ messageId: 'requireGetDefault' }],
        output:
          'const rules = "allow read: if resource.data.get(\'fieldX\', null) != null;";',
      },
      // Nested gets where inner is missing default
      {
        code: "const rules = \"allow update: if request.resource.data.get('user', null).get('name') != null;\";",
        errors: [{ messageId: 'requireGetDefault' }],
        output:
          "const rules =\n  \"allow update: if request.resource.data.get('user', null).get('name', null) != null;\";",
      },
      // String with both direct access and missing default in get()
      {
        code: 'const rules = "allow read: if resource.data.user.name != null && resource.data.get(\'email\') != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('user', null).get('name', null) != null && resource.data.get('email', null) != null;\";",
      },
      // Ensure digits and underscores in field names are handled
      {
        code: 'const rules = "allow read: if resource.data.user_1.name2 != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('user_1', null).get('name2', null) != null;\";",
      },
      // Undefined comparison variants
      {
        code: 'const rules = "allow read: if request.resource.data.profile.image != undefined;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if request.resource.data.get('profile', null).get('image', null) != undefined;\";",
      },
      // Multiple problems resolved in one fix
      {
        code: 'const rules = "allow read: if request.resource.data.a.b != null || resource.data.get(\'x\') == null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if request.resource.data.get('a', null).get('b', null) != null || resource.data.get('x', null) == null;\";",
      },
      // Bracket string access
      {
        code: 'const rules = "allow read: if resource.data[\\"field-x\\"].child != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('field-x', null).get('child', null) != null;\";",
      },
      // Mixed bracket and dot chain
      {
        code: 'const rules = "allow read: if request.resource.data[\'outer\'][\\"inner\\"] === null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if request.resource.data.get('outer', null).get('inner', null) === null;\";",
      },

      // --- Emitted line width -------------------------------------------
      // Expanding `.seg` into `.get('seg', null)` adds 13 columns per path
      // segment, so the rewritten literal routinely lands past the width a
      // formatter owns. Each pair below pins one side of that decision. Every
      // asserted `output` is a Prettier fixed point at the width it was
      // measured against — width 80, except the two `printWidth` cases, which
      // are fixed points at their own configured width. The single exception is
      // the call-argument case, marked KNOWN LIMITATION where it appears.

      // Exactly 80 columns after the fix: stays on one line. One column
      // narrower than the case below, so the two pin the boundary.
      {
        code: 'const rules = "allow read: if resource.data.organization != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules = "allow read: if resource.data.get(\'organization\', null) != null;";',
      },
      // 81 columns after the fix: breaks after the `=`, which is a string
      // literal's only break point.
      {
        code: 'const rules = "allow read: if resource.data.organizations != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules =\n  "allow read: if resource.data.get(\'organizations\', null) != null;";',
      },
      // The reported reproduction: a prettier-stable 66-column input whose
      // single-line rewrite is 92 columns.
      {
        code: "const rules = 'allow read: if resource.data.meta.ownerId != null;';",
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules =\n  \"allow read: if resource.data.get('meta', null).get('ownerId', null) != null;\";",
      },
      // A `.get()` missing its default grows the line too, so the same
      // measurement governs that fix.
      {
        code: 'const rules = "allow read: if resource.data.get(\'organizationName\') != null;";',
        errors: [{ messageId: 'requireGetDefault' }],
        output:
          'const rules =\n  "allow read: if resource.data.get(\'organizationName\', null) != null;";',
      },
      // Assignment to an existing binding breaks after its operator.
      {
        code: 'rules = "allow read: if resource.data.meta.ownerId != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "rules =\n  \"allow read: if resource.data.get('meta', null).get('ownerId', null) != null;\";",
      },
      // A chain of assignments keeps every operator on the statement's line
      // and breaks after the last one.
      {
        code: 'draft = published = "allow read: if resource.data.meta.owner != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "draft = published =\n  \"allow read: if resource.data.get('meta', null).get('owner', null) != null;\";",
      },
      // An object key narrower than the indentation step plus three is never
      // broken after, however far past the width the value runs. Wrapping here
      // would be pulled straight back and fail `prettier --check` in the other
      // direction.
      {
        code: `const config = {
  rule: "allow read: if resource.data.meta.ownerId != null;",
};`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `const config = {
  rule: "allow read: if resource.data.get('meta', null).get('ownerId', null) != null;",
};`,
      },
      // A wider key does break, one step in from the property's own line.
      {
        code: `const config = {
  firestoreRules: "allow read: if resource.data.meta.owner != null;",
};`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `const config = {
  firestoreRules:
    "allow read: if resource.data.get('meta', null).get('owner', null) != null;",
};`,
      },
      // A class property carries no short-key exemption.
      {
        code: `class Guard {
  rules = "allow read: if resource.data.meta.ownerId != null;";
}`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `class Guard {
  rules =
    "allow read: if resource.data.get('meta', null).get('ownerId', null) != null;";
}`,
      },
      // Nested declarations wrap one step in from their own indentation.
      {
        code: `function buildRules() {
  const rules = "allow read: if resource.data.meta.owner != null;";
}`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `function buildRules() {
  const rules =
    "allow read: if resource.data.get('meta', null).get('owner', null) != null;";
}`,
      },
      // The indentation step is read from the file, so a four-space file is not
      // rewritten into two.
      {
        code: `function buildRules() {
    const rules = "allow read: if resource.data.meta.owner != null;";
}`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `function buildRules() {
    const rules =
        "allow read: if resource.data.get('meta', null).get('owner', null) != null;";
}`,
      },
      {
        code: `namespace Rules {
  export const rules = "allow read: if resource.data.meta.own != null;";
}`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `namespace Rules {
  export const rules =
    "allow read: if resource.data.get('meta', null).get('own', null) != null;";
}`,
      },
      {
        code: 'export const rules = "allow read: if resource.data.meta.owner != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "export const rules =\n  \"allow read: if resource.data.get('meta', null).get('owner', null) != null;\";",
      },
      // Sibling declarators sit one step in from the keyword and the wrapped
      // value one step in from those, so the first declarator wraps two steps.
      {
        code: `const rules = "allow read: if resource.data.meta.ownerId != null;",
  version = 1;`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `const rules =
    "allow read: if resource.data.get('meta', null).get('ownerId', null) != null;",
  version = 1;`,
      },
      // A `return` is left on one over-wide line because that is exactly what
      // Prettier does with it.
      {
        code: `function buildRules() {
  return "allow read: if resource.data.meta.ownerId != null;";
}`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `function buildRules() {
  return "allow read: if resource.data.get('meta', null).get('ownerId', null) != null;";
}`,
      },
      // A trailing line comment is pushed past the width without counting
      // toward it, so the code portion at exactly 80 stays flat.
      {
        code: 'const rules = "allow read: if resource.data.organization != null;"; // ok',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules = "allow read: if resource.data.get(\'organization\', null) != null;"; // ok',
      },
      // A comment between the operator and the literal sits inside the range a
      // wrap rewrites, so the fix stays on the literal and the comment survives.
      {
        code: 'const rules = /* rules */ "if resource.data.owner != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules = /* rules */ "if resource.data.get(\'owner\', null) != null;";',
      },
      // An already-wrapped literal carries the formatter's answer; the fix
      // replaces the literal without inserting a second break.
      {
        code: `const rules =
  "allow read: if resource.data.organizationName.ownerId != null;";`,
        errors: [{ messageId: 'useGetAccess' }],
        output: `const rules =
  "allow read: if resource.data.get('organizationName', null).get('ownerId', null) != null;";`,
      },
      // KNOWN LIMITATION: Prettier answers an over-wide call argument by
      // breaking the CALL open, and whether that emits a trailing comma depends
      // on `trailingComma`, which this rule has no option for. Guessing is worse
      // than leaving the line, so the literal is replaced in place.
      {
        code: 'publish("allow read: if resource.data.meta.ownerId != null;");',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "publish(\"allow read: if resource.data.get('meta', null).get('ownerId', null) != null;\");",
      },

      // --- printWidth option --------------------------------------------
      // Lowering the width breaks a line that stays flat at the default...
      {
        code: 'const rules = "allow read: if resource.data.organization != null;";',
        options: [{ printWidth: 40 }],
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules =\n  "allow read: if resource.data.get(\'organization\', null) != null;";',
      },
      // ...and raising it keeps flat a line that breaks at the default, so the
      // option is a live measurement in both directions rather than a one-way
      // switch.
      {
        code: 'const rules = "allow read: if resource.data.organizations != null;";',
        options: [{ printWidth: 120 }],
        errors: [{ messageId: 'useGetAccess' }],
        output:
          'const rules = "allow read: if resource.data.get(\'organizations\', null) != null;";',
      },
    ],
  },
);
