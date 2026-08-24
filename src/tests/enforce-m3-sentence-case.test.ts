import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceM3SentenceCase } from '../rules/enforce-m3-sentence-case';

ruleTesterJsx.run('enforce-m3-sentence-case', enforceM3SentenceCase, {
  valid: [
    // Sentence case JSX text — single words pass
    `<Button>Cancel</Button>`,
    `<Button>Done</Button>`,
    `<Button>OK</Button>`,

    // Sentence case multi-word JSX text (already correct)
    `<Typography>Add player</Typography>`,
    `<Typography>Enable queue</Typography>`,
    `<Typography>Event visibility</Typography>`,
    `<Typography>Go to browser</Typography>`,
    `<Typography>Back to app</Typography>`,

    // Sentence case props
    `<TextField label="Full name" />`,
    `<TextField label="Email address" />`,
    `<TextField placeholder="Enter your name" />`,
    `<DateTimePicker label="Scheduled for" />`,

    // Proper nouns — brands in the ignored list must not be flagged
    `<Typography>Sign in with Google</Typography>`,
    `<Typography>Connect your Discord account</Typography>`,
    `<Typography>Welcome to BluMint</Typography>`,
    `<TextField label="Enter BluMint username" />`,

    // Acronym-containing strings should pass
    `<Chip label="FAQ" />`,
    `<Typography>Connect via API</Typography>`,
    `<TextField label="Enter URL" />`,
    `<Typography>Your user ID</Typography>`,
    `<Typography>Edit FAQ entries</Typography>`,

    // Short single-letter / short tokens pass
    `<Button>OK</Button>`,

    // Numeric / symbol only — not user-facing prose
    `<Typography>100</Typography>`,
    `<Typography>$42.00</Typography>`,

    // Dynamic JSX expressions are not checked
    `<Typography>{dynamicLabel}</Typography>`,
    `<TextField label={computedLabel} />`,

    // Non-checked props are ignored
    `<div className="Full Name" />`,
    `<div style={{ color: 'Title Case Text' }} />`,

    // Multiple sentences where each starts with a capital letter should pass
    `<Typography>Save changes. Continue editing.</Typography>`,
    `<Typography>Are you sure? This cannot be undone.</Typography>`,

    // allowList exact match
    {
      code: `<Typography>Challenge Streamers. Win Cash.</Typography>`,
      options: [{ allowList: ['Challenge Streamers. Win Cash.'] }],
    },

    // Custom ignorePatterns — full acronym-only string
    {
      code: `<Typography>NFT</Typography>`,
      options: [{ ignorePatterns: ['^[A-Z]{2,}$'] }],
    },

    // Colon-separated text where only first word after colon is capitalised
    `<Typography>Lobby code: Something here</Typography>`,

    // overline variant text — single ALL-CAPS word (no multi-word ALL-CAPS)
    `<Typography variant="overline">FEATURED</Typography>`,

    // camelCase / URL-like strings are skipped
    `<TextField label="camelCaseValue" />`,

    // ── Intercapped proper nouns (issue #2105) ───────────────────────────────
    // A capital away from a word's start is a proper-noun signal: Title Case
    // would spell these "Blubot", "Paypal", "Typescript". None is enumerated in
    // DEFAULT_IGNORED_WORDS, so each is caught by shape alone.
    `<Button label="Enable BluBot in chat" />`,
    `<Button label="Reconnect BluBot" />`,
    `<Button label="Pay with PayPal" />`,
    `<Button label="Open in TypeScript" />`,
    `<Typography>Written in JavaScript</Typography>`,
    `<Typography>Deploy to GitLab</Typography>`,
    `<Typography>Chat on WhatsApp</Typography>`,
    `<Typography>Host on DigitalOcean</Typography>`,
    `<Typography>Visit McDonald today</Typography>`,
    `<TextField label="Order a MacBook now" />`,

    // The capitals need not follow a lower-case letter: "VSCode" is a name for
    // the same reason "PayPal" is.
    `<Typography>Open in VSCode</Typography>`,

    // Surrounding punctuation is peeled off before the word is judged
    `<Typography>Reconnect BluBot.</Typography>`,
    `<Typography>Configure BluBot, then relax</Typography>`,
    `<Typography>Use (BluBot) for moderation</Typography>`,

    // A name at the sentence start stays a name
    `<Typography>BluBot is offline</Typography>`,
    `<Typography>McDonald opens at nine</Typography>`,

    // Hyphenated text whose segments are all sentence case
    `<Typography>Use the built-in BluBot commands</Typography>`,

    // A possessive is judged by its segments, so the name still carries
    `<Typography>Visit McDonald's today</Typography>`,

    // A word that is both enumerated and intercapped resolves the same way
    `<Typography>Sign in with GitHub</Typography>`,
    `<Typography>Watch on YouTube</Typography>`,
    `<Typography>Stream to TikTok</Typography>`,
    `<Typography>Play on PlayStation</Typography>`,
    `<Typography>Share to LinkedIn</Typography>`,
    `<Typography>Buy an iPhone</Typography>`,
    `<Typography>Run on macOS</Typography>`,

    // A lower-case initial never reached the Title Case test to begin with
    `<Typography>Join the eSports league</Typography>`,

    // Brands supplied through the option are exempt whatever their shape
    {
      code: `<Typography>Welcome to AcmeCorp store</Typography>`,
      options: [{ ignoredWords: ['AcmeCorp'] }],
    },

    // All-caps acronyms keep their own carve-out
    `<Typography>Copy the URL</Typography>`,
    `<Typography>Open the JSON file</Typography>`,

    // Single-letter words carry no interior position at all
    `<Typography>Grade A BluBot support</Typography>`,

    // Single-token names pinned: the per-word test must not disturb the
    // whole-string one they already rely on
    `<Button label="BluBot" />`,
    `<Button label="TypeScript" />`,
    `<Button label="VSCode" />`,

    // The suggested output of an ALL-CAPS violation is itself valid — the fix
    // must be stable (issue #1370).
    `<Typography>The user's file</Typography>`,
    `<Typography>Click here to continue</Typography>`,
    `<Typography>Enter your API key now</Typography>`,
    `<Typography>Sign in with Google account</Typography>`,
    `<Typography>Warning: Data lost forever</Typography>`,
    `<button aria-label={'The user\\'s file'} />`,

    // checkJsxText: false skips inline text entirely
    {
      code: `<Button>SUBMIT FORM</Button>`,
      options: [{ checkJsxText: false }],
    },
  ],

  invalid: [
    // ── JSX text violations ──────────────────────────────────────────────────

    // Title Case in JSX text children
    {
      code: `<Button>Back To App</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<Button>Go To Browser</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<Button>Save Changes</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<Button>Click Here</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<Button>Add New Item</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },

    // ALL CAPS in JSX text children
    {
      code: `<Button>SUBMIT FORM</Button>`,
      errors: [{ messageId: 'allCaps' }],
    },
    {
      code: `<Typography>CLICK HERE TO CONTINUE</Typography>`,
      errors: [{ messageId: 'allCaps' }],
    },

    // ── Prop violations ──────────────────────────────────────────────────────

    // Title Case in label prop
    {
      code: `<TextField label="Full Name" />`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<TextField label="Min Winners" />`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<TextField label="Max Winners" />`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<DateTimePicker label="Scheduled For" />`,
      errors: [{ messageId: 'titleCase' }],
    },

    // Title Case in placeholder prop
    {
      code: `<TextField placeholder="Enter Your Name" />`,
      errors: [{ messageId: 'titleCase' }],
    },

    // Title Case in aria-label prop
    {
      code: `<IconButton aria-label="Add New Item" />`,
      errors: [{ messageId: 'titleCase' }],
    },

    // Title Case in title prop
    {
      code: `<Tooltip title="Click To Expand" />`,
      errors: [{ messageId: 'titleCase' }],
    },

    // Title Case in alt prop
    {
      code: `<img alt="User Profile Picture" />`,
      errors: [{ messageId: 'titleCase' }],
    },

    // Title Case in JSXExpressionContainer string
    {
      code: `<TextField label={"Full Name"} />`,
      errors: [{ messageId: 'titleCase' }],
    },

    // Additional title case patterns from the issue
    {
      code: `<Button>Sign In Now</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<TextField label="Enter Name" />`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<TextField label="First Name" />`,
      errors: [{ messageId: 'titleCase' }],
    },
    {
      code: `<Button>Best Deals Today</Button>`,
      errors: [{ messageId: 'titleCase' }],
    },

    // ── Suggestion escaping + ALL-CAPS casing regressions (issue #1370) ──────

    // An apostrophe inside a single-quoted ALL-CAPS string must stay escaped in
    // the suggestion, and the whole string must be sentence-cased.
    {
      code: `export const x = <button aria-label={'THE USER\\'S FILE'} />;`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `export const x = <button aria-label={'The user\\'s file'} />;`,
            },
          ],
        },
      ],
    },

    // Embedded double quotes inside a double-quoted JS string stay escaped
    {
      code: `const x = <button aria-label={"SAY \\"HI\\" NOW"} />;`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `const x = <button aria-label={"Say \\"hi\\" now"} />;`,
            },
          ],
        },
      ],
    },

    // Backslashes in a JS string must be re-escaped, not emitted verbatim
    {
      code: `const x = <button aria-label={'SAVE TO C:\\\\TEMP FOLDER'} />;`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `const x = <button aria-label={'Save to c:\\\\temp folder'} />;`,
            },
          ],
        },
      ],
    },

    // Control characters must be re-escaped rather than written out raw
    {
      code: `const x = <button aria-label={'THE \\u0000 USER FILE'} />;`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `const x = <button aria-label={'The \\u0000 user file'} />;`,
            },
          ],
        },
      ],
    },

    // JSX attribute strings do not honour backslash escapes, so an entity-encoded
    // delimiter must be written back as an entity
    {
      code: `<TextField label='THE USER&#39;S FILE' />`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<TextField label='The user&#39;s file' />`,
            },
          ],
        },
      ],
    },
    {
      code: `<TextField label="THE USER&quot;S FILE" />`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<TextField label="The user&quot;s file" />`,
            },
          ],
        },
      ],
    },
    // An ampersand read back off the AST is decoded, so it must be re-encoded
    {
      code: `<TextField label="Tom &amp; Jerry Show" />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<TextField label="Tom &amp; jerry show" />`,
            },
          ],
        },
      ],
    },

    // JSX text: entity-encoded characters must survive the rewrite
    {
      code: `<Typography>A &lt; B COMPARISON TEXT</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>A &lt; b comparison text</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>USE &#123;BRACES&#125; HERE NOW</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Use &#123;braces&#125; here now</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>TOM & JERRY SHOW</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Tom &amp; jerry show</Typography>`,
            },
          ],
        },
      ],
    },

    // JSX text with an apostrophe — `USER'S` is one word, not `USER` + `'S`
    {
      code: `<Typography>THE USER'S FILE</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>The user's file</Typography>`,
            },
          ],
        },
      ],
    },

    // ALL-CAPS multi-word text is sentence-cased in full, not one character
    {
      code: `<Button>SUBMIT FORM</Button>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            { messageId: 'allCaps', output: `<Button>Submit form</Button>` },
          ],
        },
      ],
    },
    {
      code: `<Typography>CLICK HERE TO CONTINUE</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Click here to continue</Typography>`,
            },
          ],
        },
      ],
    },

    // Surrounding whitespace of the JSX text node is preserved
    {
      code: `<Typography>\n  SUBMIT FORM\n</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>\n  Submit form\n</Typography>`,
            },
          ],
        },
      ],
    },

    // Allowlisted acronyms keep their casing inside an ALL-CAPS fix
    {
      code: `<Typography>ENTER YOUR API KEY NOW</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Enter your API key now</Typography>`,
            },
          ],
        },
      ],
    },
    // Proper nouns are restored to their canonical spelling, not flattened
    {
      code: `<Typography>SIGN IN WITH GOOGLE ACCOUNT</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Sign in with Google account</Typography>`,
            },
          ],
        },
      ],
    },
    // ...including words supplied through the `ignoredWords` option
    {
      code: `<Typography>WELCOME TO ACME STORE</Typography>`,
      options: [{ ignoredWords: ['Acme'] }],
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Welcome to Acme store</Typography>`,
            },
          ],
        },
      ],
    },

    // Each sentence segment gets its own leading capital
    {
      code: `<Typography>WARNING: DATA LOST FOREVER</Typography>`,
      errors: [
        {
          messageId: 'allCaps',
          suggestions: [
            {
              messageId: 'allCaps',
              output: `<Typography>Warning: Data lost forever</Typography>`,
            },
          ],
        },
      ],
    },

    // ── Title Case suggestions (existing behaviour pinned) ───────────────────

    {
      code: `<TextField label="Full Name" />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<TextField label="Full name" />`,
            },
          ],
        },
      ],
    },
    {
      code: `<Button>Back To App</Button>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            { messageId: 'titleCase', output: `<Button>Back to app</Button>` },
          ],
        },
      ],
    },
    {
      code: `<TextField label={"Full Name"} />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<TextField label={"Full name"} />`,
            },
          ],
        },
      ],
    },
    // Acronyms and proper nouns survive a Title Case fix
    {
      code: `<Typography>Connect Via API</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Connect via API</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>Sign In With Google</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Sign in with Google</Typography>`,
            },
          ],
        },
      ],
    },
    // A shouting word inside otherwise Title Case text is lower-cased in full
    {
      code: `<Typography>Read The TERMS Carefully</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Read the terms carefully</Typography>`,
            },
          ],
        },
      ],
    },
    // Namespaced attribute names are matched as `namespace:name`
    {
      code: `<svg xlink:title="Full Name" />`,
      options: [{ propsToCheck: ['xlink:title'] }],
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<svg xlink:title="Full name" />`,
            },
          ],
        },
      ],
    },
    // Intra-word casing of the first word is preserved
    {
      code: `<TextField label="MacBook Pro Sale" />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<TextField label="MacBook pro sale" />`,
            },
          ],
        },
      ],
    },

    // ── Genuine Title Case beside intercapped names (issue #2105) ────────────

    // A single leading capital IS Title Case, so exempting "BluBot" must leave
    // "Blubot" reportable.
    {
      code: `<Button label="Enable Blubot in chat" />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Button label="Enable blubot in chat" />`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>Enable Chat</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Enable chat</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<TextField label="Enable Chat in stream" />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<TextField label="Enable chat in stream" />`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>Enable Chat Bot</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Enable chat bot</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>Save All Changes</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Save all changes</Typography>`,
            },
          ],
        },
      ],
    },

    // A Title Cased compound is not excused by its own hyphens: every segment
    // carries a single leading capital.
    {
      code: `<Typography>Enable Drag-And-Drop mode</Typography>`,
      errors: [{ messageId: 'titleCase' }],
    },

    // The name survives the rewrite that repairs the words around it
    {
      code: `<Typography>Visit McDonald Today</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Visit McDonald today</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>Visit McDonald's Today</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Visit McDonald's today</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<TextField label="Order a MacBook Today" />`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<TextField label="Order a MacBook today" />`,
            },
          ],
        },
      ],
    },
    // ...including where it carries trailing punctuation
    {
      code: `<Typography>Configure BluBot, Then Relax</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Configure BluBot, then relax</Typography>`,
            },
          ],
        },
      ],
    },
    // ...and where it opens the sentence, whose leading capital is otherwise
    // re-applied by the suggestion
    {
      code: `<Typography>BluBot Is Offline</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>BluBot is offline</Typography>`,
            },
          ],
        },
      ],
    },
    {
      code: `<Typography>eSports Finals Today</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>eSports finals today</Typography>`,
            },
          ],
        },
      ],
    },

    // A shouting token is not a name: it is still lower-cased in full while the
    // intercapped word beside it is left alone.
    {
      code: `<Typography>Read The TERMS For BluBot</Typography>`,
      errors: [
        {
          messageId: 'titleCase',
          suggestions: [
            {
              messageId: 'titleCase',
              output: `<Typography>Read the terms for BluBot</Typography>`,
            },
          ],
        },
      ],
    },
  ],
});

// Issue #1534: `ignorePatterns` entries are compiled with `new RegExp` inside
// `create()`, so a malformed source string used to escape as an opaque
// `Error while loading rule …` that aborts the whole lint run. RuleTester cannot
// express this — the throw happens at rule-load time, before a fixture is
// linted — so these cases drive the real `Linter`.
describe('enforce-m3-sentence-case: ignorePatterns validation (issue #1534)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-m3-sentence-case';

  const lint = (code: string, options?: Record<string, unknown>) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceM3SentenceCase as unknown as Rule.RuleModule,
    );
    return linter.verify(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
          ecmaFeatures: { jsx: true },
        },
        rules: {
          [RULE_ID]: options ? ['error' as const, options] : ('error' as const),
        },
      },
      'Component.tsx',
    );
  };

  const TITLE_CASE_SOURCE = `const el = <Typography>Save Changes Now</Typography>;`;

  it('reports the offending value for a literal brand string mistaken for a regex', () => {
    // `C++` is schema-valid (a string) but `+` is an unquantifiable token.
    expect(() => lint(TITLE_CASE_SOURCE, { ignorePatterns: ['C++'] })).toThrow(
      /invalid ignorePatterns/i,
    );
    expect(() => lint(TITLE_CASE_SOURCE, { ignorePatterns: ['C++'] })).toThrow(
      /C\+\+/,
    );
  });

  it('names the rule and the underlying regex reason', () => {
    expect(() => lint(TITLE_CASE_SOURCE, { ignorePatterns: ['C++'] })).toThrow(
      /enforce-m3-sentence-case: invalid ignorePatterns: C\+\+ \(.*Nothing to repeat.*\)/,
    );
  });

  it.each([['C++'], ['*.test.ts'], ['['], ['(foo']])(
    'throws an actionable error for the malformed pattern %j',
    (pattern) => {
      let thrown: unknown;
      try {
        lint(TITLE_CASE_SOURCE, { ignorePatterns: [pattern] });
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toMatch(/invalid ignorePatterns/i);
      expect(message).toContain(pattern);
    },
  );

  it('reports every malformed pattern in a single error, not just the first', () => {
    let thrown: unknown;
    try {
      lint(TITLE_CASE_SOURCE, {
        ignorePatterns: ['C++', '^[A-Z]{2,}$', '(foo', '['],
      });
    } catch (error: unknown) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect(message).toContain('C++');
    expect(message).toContain('(foo');
    expect(message).toContain('[');
    // The well-formed neighbour is not accused.
    expect(message).not.toContain('^[A-Z]{2,}$');
  });

  it('keeps compiling well-formed patterns and skipping the strings they match', () => {
    // Falsifiability: the same source is reported when the pattern is absent.
    expect(lint(TITLE_CASE_SOURCE)).toHaveLength(1);
    expect(
      lint(TITLE_CASE_SOURCE, { ignorePatterns: ['^Save '] }),
    ).toHaveLength(0);
    expect(
      lint(`const el = <Typography>NFT DROP</Typography>;`, {
        ignorePatterns: ['^[A-Z ]{2,}$'],
      }),
    ).toHaveLength(0);
  });

  it('accepts an empty or absent ignorePatterns list', () => {
    expect(() => lint(TITLE_CASE_SOURCE, { ignorePatterns: [] })).not.toThrow();
    expect(() => lint(TITLE_CASE_SOURCE, {})).not.toThrow();
    expect(() => lint(TITLE_CASE_SOURCE)).not.toThrow();
    expect(lint(TITLE_CASE_SOURCE, { ignorePatterns: [] })).toHaveLength(1);
  });
});
