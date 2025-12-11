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
  ],
});
