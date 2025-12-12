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
          "const rules = \"allow read: if resource.data.get('fieldX', null).get('fieldY', null) != null;\";",
      },
      // request.resource variant
      {
        code: 'const rules = "allow update: if request.resource.data.fieldX.fieldY != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow update: if request.resource.data.get('fieldX', null).get('fieldY', null) != null;\";",
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
          "const rules = \"allow read: if resource.data.get('foo', null).get('bar', null) === null;\";",
      },
      {
        code: 'const rules = "allow read: if resource.data.foo.bar !== undefined;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('foo', null).get('bar', null) !== undefined;\";",
      },
      // Parentheses around expression
      {
        code: 'const rules = "allow read: if (resource.data.user.name != null);";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if (resource.data.get('user', null).get('name', null) != null);\";",
      },
      // Extra whitespace
      {
        code: 'const rules = "allow read: if resource.data.user.name    !=    null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('user', null).get('name', null)    !=    null;\";",
      },
      // Multiple occurrences in one string (we apply all fixes at once but still report once)
      {
        code: 'const rules = "allow read: if resource.data.a.b != null && request.resource.data.x.y == null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('a', null).get('b', null) != null && request.resource.data.get('x', null).get('y', null) == null;\";",
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
          "const rules = \"allow update: if request.resource.data.get('user', null).get('name', null) != null;\";",
      },
      // String with both direct access and missing default in get()
      {
        code: 'const rules = "allow read: if resource.data.user.name != null && resource.data.get(\'email\') != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('user', null).get('name', null) != null && resource.data.get('email', null) != null;\";",
      },
      // Ensure digits and underscores in field names are handled
      {
        code: 'const rules = "allow read: if resource.data.user_1.name2 != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('user_1', null).get('name2', null) != null;\";",
      },
      // Undefined comparison variants
      {
        code: 'const rules = "allow read: if request.resource.data.profile.image != undefined;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if request.resource.data.get('profile', null).get('image', null) != undefined;\";",
      },
      // Preserve escape sequences when serializing strings with newlines/backslashes
      {
        code: 'const rules = "allow read: if resource.data.field != null;\\nnext line";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('field', null) != null;\\nnext line\";",
      },
      // Multiple problems resolved in one fix
      {
        code: 'const rules = "allow read: if request.resource.data.a.b != null || resource.data.get(\'x\') == null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if request.resource.data.get('a', null).get('b', null) != null || resource.data.get('x', null) == null;\";",
      },
      // Bracket string access
      {
        code: 'const rules = "allow read: if resource.data[\\"field-x\\"].child != null;";',
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if resource.data.get('field-x', null).get('child', null) != null;\";",
      },
      // Mixed bracket and dot chain
      {
        code: "const rules = \"allow read: if request.resource.data['outer'][\\\"inner\\\"] === null;\";",
        errors: [{ messageId: 'useGetAccess' }],
        output:
          "const rules = \"allow read: if request.resource.data.get('outer', null).get('inner', null) === null;\";",
      },
    ],
  },
);
