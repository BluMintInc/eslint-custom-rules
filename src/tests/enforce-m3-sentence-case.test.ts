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
  ],
});
