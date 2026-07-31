# Enforce the use of -Rounded variant for MUI icons (`@blumintinc/blumint/enforce-mui-rounded-icons`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`@mui/icons-material` ships each icon in several visual variants (Filled, Outlined, Rounded, Sharp, Two Tone). BluMint's design language uses the **Rounded** variant everywhere, so mixing variants in the same surface is a visual inconsistency that is easy to introduce and hard to spot in review.

This rule requires every deep import from `@mui/icons-material/*` to name a `*Rounded` module, and auto-fixes the module specifier when it does not.

## Rule Details

The rule inspects the module specifier of each `import` declaration whose path starts with `@mui/icons-material/`:

- A specifier that already ends in `Rounded` passes.
- A specifier naming another variant (`Outlined`, `Sharp`, `TwoTone`) is rewritten to the Rounded variant of its **base** icon: `AddReactionOutlined` becomes `AddReactionRounded`, not `AddReactionOutlinedRounded`, which does not exist. The suffix is matched exactly, so a distinct icon such as `MailOutline` (which ends in "Outline", not "Outlined") keeps its full name and maps to `MailOutlineRounded`.
- Brand icons that MUI ships in a single Filled variant — `Apple`, `GitHub`, `Google`, `Instagram`, `LinkedIn`, `Microsoft`, `Pinterest`, `Reddit`, `Telegram`, `Twitter`, `WhatsApp`, `X`, `YouTube` — have no Rounded counterpart, so they are left alone rather than fixed into a module that does not resolve.

Imports from any other package, and dynamic `import()` expressions whose specifier is not a static string, are ignored.

### Examples of incorrect code

```ts
import LogoutIcon from '@mui/icons-material/Logout';
```

```ts
import LogoutIcon from '@mui/icons-material/Logout';
import AddLinkIcon from '@mui/icons-material/AddLink';
import PersonIcon from '@mui/icons-material/Person';
```

```ts
// A non-Rounded variant maps to the Rounded variant of the base icon
import AddReactionIcon from '@mui/icons-material/AddReactionOutlined';
import DeleteIcon from '@mui/icons-material/DeleteSharp';
import PhoneIcon from '@mui/icons-material/PhoneTwoTone';
```

### Examples of correct code

```ts
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import AddLinkIcon from '@mui/icons-material/AddLinkRounded';
import PersonIcon from '@mui/icons-material/PersonRounded';
```

```ts
// MailOutline is its own icon, so its Rounded variant keeps the full name
import MailIcon from '@mui/icons-material/MailOutlineRounded';
```

```ts
// Brand icons ship in one variant only and have no Rounded counterpart
import GoogleIcon from '@mui/icons-material/Google';
import AppleIcon from '@mui/icons-material/Apple';
import GitHubIcon from '@mui/icons-material/GitHub';
import XIcon from '@mui/icons-material/X';
```

```ts
// Not an @mui/icons-material import
import { SomeIcon } from 'some-other-library';
```

```ts
// A dynamic specifier is not statically checkable, so it is ignored
const iconName = 'Logout';
const IconComponent = React.lazy(() => import(`@mui/icons-material/${iconName}`));
```

## When Not To Use It

Disable this rule if your product's design language standardizes on a different MUI icon variant, or disable it inline for the rare icon whose Rounded variant is visually wrong for a specific surface.
