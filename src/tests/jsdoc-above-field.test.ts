import { jsdocAboveField } from '../rules/jsdoc-above-field';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('jsdoc-above-field', jsdocAboveField, {
  valid: [
    // JSDoc above type field
    `export type User = {
  /** User phone number */
  phone?: string;
};`,

    // Interface field with proper JSDoc placement
    `interface Profile {
  /** Display name shown in UI */
  displayName: string;
}`,

    // Class field with decorator and JSDoc above
    `class Entity {
  /** Database identifier */
  @PrimaryKey()
  id!: string;
}`,

    // Inline non-JSDoc comment should be allowed
    `type Metrics = {
  count: number; // safe inline comment
};`,

    // Inline JSDoc placed before the field on the same line should be treated as leading documentation, not trailing
    `type InlineLeadingDocs = {
  /** User phone number */ phone?: string;
};`,

    // Inline block comment that is not JSDoc should be allowed
    `type Flags = {
  isEnabled: boolean; /* not a jsdoc */
};`,

    // Object literal inline JSDoc is ignored by default
    `const config = {
  timeout: 3000, /** @remarks milliseconds */
};`,

    // Multi-line JSDoc already above property
    `type Settings = {
  /**
   * @remarks Cache size in MB
   */
  cacheSize: number;
};`,

    // Interface merging stays valid when docs are above fields
    `interface Account {
  /** Unique account id */
  id: string;
}

interface Account {
  /** Contact email */
  email?: string;
}`,

    // Class field without JSDoc is fine
    `class Team {
  name!: string;
}`,

    // Object literal enforcement enabled with correct placement
    {
      code: `const options = {
  /** @remarks delay between retries */
  retryDelay: 1000,
};`,
      options: [{ checkObjectLiterals: true }],
    },

    // JSDoc above a class field stays valid once the separator no longer gates detection
    `class Session {
  /** @remarks JWT token */
  token!: string;
}`,

    // A JSDoc block on its own line documents no field on the line above it
    `type Trailing = {
  phone?: string;
  /** @remarks describes the shape, not a field */
};`,

    // Non-JSDoc block comment in the prettier-canonical position is not documentation
    `type Flags = {
  isEnabled: boolean /* not a jsdoc */;
};`,

    // Line comments never reach IDE hovers, so placement is unconstrained
    `class Sensor {
  reading!: number; // trailing note stays inline
}`,

    // Past the separator an own-line block is the NEXT field's leading
    // documentation, so token-order attachment must stop at the separator
    `type Contact = {
  phone?: string;
  /** @remarks display name shown in UI */
  displayName: string;
};`,

    // Same carve-out with the members separated by newlines alone: without a
    // separator token there is no gap for the block to sit inside
    `type Contact = {
  phone?: string
  /** @remarks display name shown in UI */
  displayName: string
};`,

    // Class fields keep the carve-out: prettier parks a trailing block after
    // the field's `;`, exactly where a leading block for the next field lives
    `class Account {
  id!: string;
  /** @remarks lowercased on write */
  email!: string;
}`,

    // Object literal leading documentation stays leading documentation
    {
      code: `const options = {
  retryDelay: 1000,
  /** @remarks attempts before giving up */
  retries: 3,
};`,
      options: [{ checkObjectLiterals: true }],
    },

    // A block after the last property's separator documents the shape
    {
      code: `const options = {
  retryDelay: 1000,
  /** @remarks tuning knobs live here */
};`,
      options: [{ checkObjectLiterals: true }],
    },

    // A blank line between the separator and the block does not attach it
    `type Contact = {
  phone?: string;

  /** @remarks display name shown in UI */
  displayName: string;
};`,

    // A nested literal's leading documentation belongs to the inner field
    `type Contact = {
  address: {
    /** @remarks two-letter code */
    country: string;
  };
};`,

    // Documentation inside a member's own type annotation is not trailing
    `type Handlers = {
  onSelect: (/** @remarks row identifier */ id: string) => void;
};`,

    // Object literals stay unchecked by default, canonical spelling included
    `const headers = {
  accept: 'json'
  /** @remarks header is lowercase */,
};`,

    // A one-line type literal whose block leads the field needs no expansion
    `type InlineLeading = { /** @remarks user phone */ phone?: string };`,

    // A one-line literal's non-JSDoc block never reaches an IDE hover
    `type Flags = { isEnabled: boolean /* not a jsdoc */ };`,

    // One-line object literals stay unchecked while the option is off
    `const inline = { timeout: 3000 /** @remarks milliseconds */ };`,

    // Documentation inside a one-line member's own type is not trailing
    `type Handlers = { onSelect: (/** @remarks row id */ id: string) => void };`,
  ],
  invalid: [
    {
      code: `export type User = {
  phone?: string; /** @remarks stores digits like "+15168384181" */
};`,
      output: `export type User = {
  /** @remarks stores digits like "+15168384181" */
  phone?: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type InlineType = { value: string; /** @remarks stays with field */ };`,
      output: `type InlineType = {
  /** @remarks stays with field */
  value: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `interface Profile {
  username: string; /** @remarks unique handle */
}`,
      output: `interface Profile {
  /** @remarks unique handle */
  username: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Settings = {
  timeout: number; /**
   * @remarks milliseconds
   * ensure positive
   */
};`,
      output: `type Settings = {
  /**
   * @remarks milliseconds
   * ensure positive
   */
  timeout: number;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Example = {
  value: string; /**
   * @example
   *   const x = 1;
   *     const y = 2;
   */
};`,
      output: `type Example = {
  /**
   * @example
   *   const x = 1;
   *     const y = 2;
   */
  value: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Nested = {
  field: string; /** @remarks
                  *   nested line 1
                  *     nested line 2
                  */
};`,
      output: `type Nested = {
  /** @remarks
   * nested line 1
   *   nested line 2
   */
  field: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class User {
  @Column()
  private readonly email?: string; /** @remarks must be lowercase */
}`,
      output: `class User {
  /** @remarks must be lowercase */
  @Column()
  private readonly email?: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class Session {
  token!: string; /** @remarks JWT token */
}`,
      output: `class Session {
  /** @remarks JWT token */
  token!: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type FirestoreDoc = {
  'created-at': string; /** @remarks ISO string */
};`,
      output: `type FirestoreDoc = {
  /** @remarks ISO string */
  'created-at': string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `interface Flags {
  readonly isEnabled: boolean; /** @remarks controls feature toggle */
}`,
      output: `interface Flags {
  /** @remarks controls feature toggle */
  readonly isEnabled: boolean;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class WithDecorator {
  @Transform(String)
  phone!: number; /** @remarks stored as string */
}`,
      output: `class WithDecorator {
  /** @remarks stored as string */
  @Transform(String)
  phone!: number;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `const config = {
  timeout: 3000, /** @remarks in milliseconds */
};`,
      output: `const config = {
  /** @remarks in milliseconds */
  timeout: 3000,
};`,
      options: [{ checkObjectLiterals: true }],
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `const headers = {
  accept: 'json', /**
   * @remarks header is lowercase
   */
};`,
      output: `const headers = {
  /**
   * @remarks header is lowercase
   */
  accept: 'json',
};`,
      options: [{ checkObjectLiterals: true }],
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type InlineDocs = {
  size: number; /** sized in bytes */
  label: string; /** @remarks shown to users */
};`,
      output: `type InlineDocs = {
  /** sized in bytes */
  size: number;
  /** @remarks shown to users */
  label: string;
};`,
      errors: [
        { messageId: 'moveJsdocAbove' },
        { messageId: 'moveJsdocAbove' },
      ],
    },
    {
      code: `interface Merged {
  id: string; /** @remarks per interface part */
}

interface Merged {
  email: string; /** @remarks second part */
}`,
      output: `interface Merged {
  /** @remarks per interface part */
  id: string;
}

interface Merged {
  /** @remarks second part */
  email: string;
}`,
      errors: [
        { messageId: 'moveJsdocAbove' },
        { messageId: 'moveJsdocAbove' },
      ],
    },
    // Prettier canonicalises trailing JSDoc to sit before the separator, so the
    // spellings below are what formatted source actually contains.
    {
      code: `export type User = {
  phone?: string /** @remarks stores digits like "+15168384181" */;
};`,
      output: `export type User = {
  /** @remarks stores digits like "+15168384181" */
  phone?: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Coordinates = {
  latitude: number /** @remarks decimal degrees */,
  longitude: number,
};`,
      output: `type Coordinates = {
  /** @remarks decimal degrees */
  latitude: number,
  longitude: number,
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `interface Profile {
  username: string /** @remarks unique handle */;
}`,
      output: `interface Profile {
  /** @remarks unique handle */
  username: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class Session {
  token!: string /** @remarks JWT token */;
}`,
      output: `class Session {
  /** @remarks JWT token */
  token!: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class User {
  @Column()
  private readonly email?: string /** @remarks must be lowercase */;
}`,
      output: `class User {
  /** @remarks must be lowercase */
  @Column()
  private readonly email?: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Settings = {
  timeout: number /**
   * @remarks milliseconds
   * ensure positive
   */;
};`,
      output: `type Settings = {
  /**
   * @remarks milliseconds
   * ensure positive
   */
  timeout: number;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `const config = {
  timeout: 3000 /** @remarks in milliseconds */,
};`,
      output: `const config = {
  /** @remarks in milliseconds */
  timeout: 3000,
};`,
      options: [{ checkObjectLiterals: true }],
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    // A block too wide to share the field's line is reflowed onto its own line
    // ahead of the separator, which is the only spelling formatted source
    // contains. Every case below is prettier 2.8.8's output for the same-line
    // fixture above it.
    {
      code: `type Settings = {
  timeout: number
  /**
   * @remarks milliseconds
   * ensure positive
   */;
};`,
      output: `type Settings = {
  /**
   * @remarks milliseconds
   * ensure positive
   */
  timeout: number;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Example = {
  value: string
  /**
   * @example
   *   const x = 1;
   *     const y = 2;
   */;
};`,
      output: `type Example = {
  /**
   * @example
   *   const x = 1;
   *     const y = 2;
   */
  value: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Nested = {
  field: string
  /** @remarks
   *   nested line 1
   *     nested line 2
   */;
};`,
      output: `type Nested = {
  /** @remarks
   * nested line 1
   *   nested line 2
   */
  field: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `const headers = {
  accept: 'json'
  /**
   * @remarks header is lowercase
   */,
};`,
      output: `const headers = {
  /**
   * @remarks header is lowercase
   */
  accept: 'json',
};`,
      options: [{ checkObjectLiterals: true }],
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    // The block sits between two fields, so the report has to name the one the
    // separator still follows rather than the one below it
    {
      code: `interface Profile {
  username: string
  /**
   * @remarks unique handle
   * lowercase only
   */;
  displayName: string;
}`,
      output: `interface Profile {
  /**
   * @remarks unique handle
   * lowercase only
   */
  username: string;
  displayName: string;
}`,
      errors: [
        {
          messageId: 'moveJsdocAbove',
          data: { name: 'username', kind: 'type field' },
        },
      ],
    },
    {
      code: `class Session {
  token!: string
  /** @remarks JWT token */;
  refresh!: string;
}`,
      output: `class Session {
  /** @remarks JWT token */
  token!: string;
  refresh!: string;
}`,
      errors: [
        {
          messageId: 'moveJsdocAbove',
          data: { name: 'token', kind: 'class field' },
        },
      ],
    },
    {
      code: `class User {
  @Column()
  private readonly email?: string
  /** @remarks must be lowercase */;
}`,
      output: `class User {
  /** @remarks must be lowercase */
  @Column()
  private readonly email?: string;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Coordinates = {
  latitude: number
  /** @remarks decimal degrees */,
  longitude: number,
};`,
      output: `type Coordinates = {
  /** @remarks decimal degrees */
  latitude: number,
  longitude: number,
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type InlineDocs = {
  size: number
  /** sized in bytes */;
  label: string
  /** @remarks shown to users */;
};`,
      output: `type InlineDocs = {
  /** sized in bytes */
  size: number;
  /** @remarks shown to users */
  label: string;
};`,
      errors: [
        { messageId: 'moveJsdocAbove' },
        { messageId: 'moveJsdocAbove' },
      ],
    },
    // Prettier keeps a type or object literal on one line whenever the source
    // has no newline after its `{`, so the field shares its line with the
    // braces and its siblings. Moving the block in place there would indent it
    // by whatever followed `{` and leave the members bunched behind it, which
    // prettier rewrites on its next pass. Each output below is prettier
    // 2.8.8's own layout, so the two tools agree on it.
    {
      code: `type InlineType = { value: string /** @remarks stays with field */ };`,
      output: `type InlineType = {
  /** @remarks stays with field */
  value: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `type Dimensions = { width: number; height: number /** @remarks in pixels */ };`,
      output: `type Dimensions = {
  width: number;
  /** @remarks in pixels */
  height: number;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `interface Point { x: number /** @remarks horizontal offset */ }`,
      output: `interface Point {
  /** @remarks horizontal offset */
  x: number;
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class Session { token = '' /** @remarks JWT token */ }`,
      output: `class Session {
  /** @remarks JWT token */
  token = '';
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `class User { @Column() email = '' /** @remarks lowercase */ }`,
      output: `class User {
  /** @remarks lowercase */
  @Column() email = '';
}`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    {
      code: `const config = { timeout: 3000 /** @remarks in milliseconds */ };`,
      output: `const config = {
  /** @remarks in milliseconds */
  timeout: 3000,
};`,
      options: [{ checkObjectLiterals: true }],
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    // The closing brace returns to the nested literal's own column, not to the
    // outer shape's
    {
      code: `type Contact = {
  address: { country: string /** @remarks two-letter code */ };
};`,
      output: `type Contact = {
  address: {
    /** @remarks two-letter code */
    country: string;
  };
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    // A sibling's inline block is not documentation, so it stays where its
    // member holds it rather than being hoisted along
    {
      code: `type Flags = { on: boolean /* toggle */; label: string /** @remarks shown */ };`,
      output: `type Flags = {
  on: boolean /* toggle */;
  /** @remarks shown */
  label: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    // A block sitting in the gap between the brace and the field belongs to no
    // member's range, so rebuilding the literal has to carry it explicitly
    {
      code: `type Meta = { /* origin */ id: string /** @remarks uuid */ };`,
      output: `type Meta = {
  /* origin */
  /** @remarks uuid */
  id: string;
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
    // Both blocks travel with the same rewrite: one left behind would land
    // past its member's separator, where it reads as a note about the shape
    // and the rule stops reporting it
    {
      code: `type Pair = { a: string /** @remarks left */; b: string /** @remarks right */ };`,
      output: `type Pair = {
  /** @remarks left */
  a: string;
  /** @remarks right */
  b: string;
};`,
      errors: [
        { messageId: 'moveJsdocAbove' },
        { messageId: 'moveJsdocAbove' },
      ],
    },
    // The indent step comes from the file rather than from prettier's default,
    // so a four-space file gains four spaces. This output is a fixed point of
    // prettier at the tab width the file itself uses.
    {
      code: `type Wrapper = {
    inner: { value: string /** @remarks four space step */ };
};`,
      output: `type Wrapper = {
    inner: {
        /** @remarks four space step */
        value: string;
    };
};`,
      errors: [{ messageId: 'moveJsdocAbove' }],
    },
  ],
});
