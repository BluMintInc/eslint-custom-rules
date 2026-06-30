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
  ],
});
