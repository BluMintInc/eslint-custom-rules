import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { enforceIdCapitalization } from '../rules/enforce-id-capitalization';

// Test with JSX support
ruleTesterJsx.run('enforce-id-capitalization', enforceIdCapitalization, {
  valid: [
    {
      code: 'const message = "Please enter your in-game ID.";',
    },
    {
      code: 'const label = "User ID:";',
    },
    {
      code: 'const error = "Invalid ID format";',
    },
    {
      code: '<div>Please enter your ID</div>',
    },
    {
      code: '<Button>Submit ID</Button>',
    },
    {
      code: 'const userId = 12345; // Variable names are not affected',
    },
    {
      code: 'function getUserId() { return 123; } // Function names are not affected',
    },
    {
      code: 'const message = "This grid system is flexible.";', // "id" as part of another word
    },
    {
      code: 'const message = "Rapid development";', // "id" as part of another word
    },
    {
      code: 'const message = `Your ID is ${userId}`;', // Already using "ID"
    },
    // Template literal quasis are not visited, so a lowercase "id" inside one
    // goes unreported. The fixer's non-Literal branch is therefore unreachable
    // and deliberately produces no fix: a quasi's delimiters and ${} sub
    // expressions live outside the node, so rebuilding one would destroy them.
    {
      code: 'const message = `Your id is ${userId}`;',
    },
    {
      code: 't("user.profile.ID");', // Translation key with correct "ID"
    },
  ],
  invalid: [
    {
      code: 'const message = "Please enter your in-game id.";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "Please enter your in-game ID.";',
    },
    {
      code: 'const label = "User id:";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const label = "User ID:";',
    },
    {
      code: 'const error = "Invalid id format";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const error = "Invalid ID format";',
    },
    {
      code: '<div>Please enter your id</div>',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: '<div>Please enter your ID</div>',
    },
    {
      code: '<Button>Submit id</Button>',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: '<Button>Submit ID</Button>',
    },
    {
      code: 't("user.profile.id");', // Translation key with incorrect "id"
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 't("user.profile.ID");',
    },
    {
      code: 'const message = "Enter id, name, and email";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "Enter ID, name, and email";',
    },
    {
      code: 'const message = "id:";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "ID:";',
    },
    // A single-quoted JSX attribute value keeps its quotes (#1558)
    {
      code: `<input placeholder='enter your id' />`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `<input placeholder='enter your ID' />`,
    },
    // JSX attribute values are not escape-processed, so a backslash there is a
    // literal character and must not be doubled by the fix
    {
      code: String.raw`<input placeholder="C:\logs your id" />`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: String.raw`<input placeholder="C:\logs your ID" />`,
    },
  ],
});

// Test with TypeScript support
ruleTesterTs.run('enforce-id-capitalization', enforceIdCapitalization, {
  valid: [
    {
      code: 'const message: string = "Please enter your ID";',
    },
    {
      code: 'interface User { id: string; } // Interface properties are not affected',
    },
    {
      code: 'type UserData = { id: number; } // Type properties are not affected',
    },
    // Test the specific bug scenario with parameter destructuring
    {
      code: `
        export type FriendCardAddProps = {
          id: string;
          username: string;
          imgUrl: string;
          friends: string[];
        };

        const FriendCardAdd = function({ id, username, imgUrl, friends }) {
          return null;
        };
      `,
    },
    // Test with function parameters
    {
      code: `
        function processUser(id: string, name: string) {
          return { id, name };
        }
      `,
    },
    // Test with object destructuring in variable declarations
    {
      code: `
        const { id, name } = user;
        console.log(id);
      `,
    },
    // Test with nested destructuring
    {
      code: `
        const { user: { id, profile } } = data;
        console.log(id);
      `,
    },
    // DOM attribute-name arguments are code, not user-facing text (#1337)
    {
      code: `element.getAttribute('id');`,
    },
    {
      code: `element.setAttribute('id', value);`,
    },
    {
      code: `element.hasAttribute('id');`,
    },
    {
      code: `element.removeAttribute('id');`,
    },
    {
      code: `element.getAttributeNode('id');`,
    },
    {
      code: `element.getAttributeNS(null, 'id');`,
    },
    // jest-dom matcher: first arg is the attribute NAME, not visible text
    {
      code: `expect(heading).toHaveAttribute('id', 'unlink-method-heading');`,
    },
    // Repro from #1874: an array element that is a lone identifier is a key
    // name, not prose. Rewriting it to 'ID' names a key that does not exist.
    {
      code: `export const KEYS = ['id', 'broadcastTest'] as const;`,
    },
    // The agora shape the repro was reduced from: a keyof-derived field tuple
    {
      code: `
        export const REPLAY_IRRELEVANT_SETTINGS_FIELDS = [
          'uploadedSounds',
          'uploadedImages',
          'id',
          'broadcastTest',
        ] as const;
      `,
    },
    // \`as const\` is not what makes it a key list — a plain array of bare
    // identifiers is one too, so the carve-out does not key on the assertion
    {
      code: `export const KEYS = ['id', 'broadcastTest'];`,
    },
    // A key list passed to a keys-ish API, with no \`as const\` and no
    // annotation to lean on
    {
      code: `const projected = pick(user, ['id', 'name']);`,
    },
    {
      code: `const FIELDS: string[] = ['id'];`,
    },
    // A spread sibling does not disturb the element-local verdict
    {
      code: `const FIELDS = [...BASE_FIELDS, 'id'];`,
    },
    // Nested array literals are key lists at every level
    {
      code: `const GROUPS = [['id', 'name'], ['status']];`,
    },
  ],
  invalid: [
    // A bare 'id' translation key is still user-facing and must stay flagged —
    // the attribute-name exemption is scoped to *Attribute callees only.
    {
      code: `t('id');`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `t('ID');`,
    },
    // Only the first (name) argument is exempt; a user-facing string in a later
    // argument position must still be flagged.
    {
      code: `element.setAttribute('data-x', 'enter your id');`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `element.setAttribute('data-x', 'enter your ID');`,
    },
    {
      code: 'const message: string = "Please enter your id";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message: string = "Please enter your ID";',
    },
    // The #1874 carve-out covers key names only: an array element that reads as
    // prose (it carries whitespace or punctuation, so it is not one identifier)
    // is still user-facing text and stays flagged.
    {
      code: `const PROMPTS = ['Enter your id', 'Name'];`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `const PROMPTS = ['Enter your ID', 'Name'];`,
    },
    {
      code: `const LABELS = ['id:'] as const;`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `const LABELS = ['ID:'] as const;`,
    },
    // The verdict is per element, not per array: a prose sibling does not drag
    // the key name in, and a key-name sibling does not shield the prose.
    {
      code: `const MIXED = ['id', 'Enter your id'] as const;`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `const MIXED = ['id', 'Enter your ID'] as const;`,
    },
    // Array-element position is load-bearing — a lone 'id' elsewhere is
    // unaffected by the carve-out
    {
      code: `const FALLBACK_LABEL = 'id';`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `const FALLBACK_LABEL = 'ID';`,
    },
    // Repro from #1558: the fix must correct the capitalization without
    // rewriting the literal's quote character.
    {
      code: `it('forwards the candidate id to the invite button', () => {});`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `it('forwards the candidate ID to the invite button', () => {});`,
    },
    // A double-quoted literal is left double-quoted — the fix preserves the
    // author's delimiter, it does not normalize it in either direction.
    {
      code: `it("forwards the candidate id to the invite button", () => {});`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `it("forwards the candidate ID to the invite button", () => {});`,
    },
    // An escaped delimiter must round-trip: the apostrophe stays escaped inside
    // a single-quoted literal
    {
      code: String.raw`const message = 'the user id\'s value';`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: String.raw`const message = 'the user ID\'s value';`,
    },
    // ...and an escaped double quote stays escaped inside a double-quoted one
    {
      code: String.raw`const message = "say \"your id\" here";`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: String.raw`const message = "say \"your ID\" here";`,
    },
    // A quote that needs no escape under the original delimiter stays bare
    {
      code: String.raw`const message = 'say "your id" here';`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: String.raw`const message = 'say "your ID" here';`,
    },
    // Escape sequences survive: a backslash is not doubled...
    {
      code: String.raw`const message = 'C:\\logs your id';`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: String.raw`const message = 'C:\\logs your ID';`,
    },
    // ...and a newline escape is not expanded into a raw line break
    {
      code: String.raw`const message = 'enter your id\nhere';`,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: String.raw`const message = 'enter your ID\nhere';`,
    },
    // Make sure user-facing text in components with destructured parameters is still flagged
    {
      code: `
        const UserProfile = function({ id, name }) {
          return "Your user id: " + id;
        };
      `,
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: `
        const UserProfile = function({ id, name }) {
          return "Your user ID: " + id;
        };
      `,
    },
  ],
});
