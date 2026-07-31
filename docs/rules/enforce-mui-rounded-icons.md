# Enforce the use of -Rounded variant for MUI icons (`@blumintinc/blumint/enforce-mui-rounded-icons`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`@mui/icons-material` ships each icon in several visual variants (Filled, Outlined, Rounded, Sharp, Two Tone). BluMint's design language uses the **Rounded** variant everywhere, so mixing variants in the same surface is a visual inconsistency that is easy to introduce and hard to spot in review.

This rule requires every icon imported from `@mui/icons-material` to name a `*Rounded` icon, in either import form:

- the **deep** import, `import LogoutIcon from '@mui/icons-material/Logout'`, where the icon is named by the module path;
- the **barrel** import, `import { Logout } from '@mui/icons-material'`, where the icon is named by each import specifier.

## Rule Details

Whichever form names the icon, the same name check applies:

- A name that already ends in `Rounded` passes.
- A name carrying another variant suffix (`Outlined`, `Sharp`, `TwoTone`) maps to the Rounded variant of its **base** icon: `AddReactionOutlined` becomes `AddReactionRounded`, not `AddReactionOutlinedRounded`, which does not exist. The suffix is matched exactly, so a distinct icon such as `MailOutline` (which ends in "Outline", not "Outlined") keeps its full name and maps to `MailOutlineRounded`.
- Brand icons that MUI ships in a single Filled variant — `Apple`, `GitHub`, `Google`, `Instagram`, `LinkedIn`, `Microsoft`, `Pinterest`, `Reddit`, `Telegram`, `Twitter`, `WhatsApp`, `X`, `YouTube` — have no Rounded counterpart, so they are left alone rather than pointed at a name that does not exist.

Imports from any other package, and dynamic `import()` expressions whose specifier is not a static string, are ignored.

### What the barrel form ignores

`@mui/icons-material` exports more than icons, and not every specifier can be rendered:

- A type-only import (`import type { SvgIconComponent } from '@mui/icons-material'`) or a type-only specifier (`import { type SvgIconComponent } from '@mui/icons-material'`) names a type, not a rendered icon, so it is never reported.
- `SvgIconComponent` — the icon component type reached through the same barrel — is not an icon in value position either, and has no `*Rounded` sibling.
- A default or namespace import (`import * as Icons from '@mui/icons-material'`) names no individual icon, so member usage is out of scope.

### What is auto-fixed

| Form | Fixed? |
| --- | --- |
| `import LogoutIcon from '@mui/icons-material/Logout'` | Yes — the module specifier becomes `'@mui/icons-material/LogoutRounded'`. |
| `import { Logout as LogoutIcon } from '@mui/icons-material'` | Yes — only the **imported** name becomes `LogoutRounded`; the local binding `LogoutIcon` and every reference to it are untouched. |
| `import { Logout } from '@mui/icons-material'` | **No** — reported without a fix. |

The unaliased barrel form is deliberately left unfixed: there the imported name *is* the local binding, so changing it renames the binding, and a correct rename would have to rewrite every reference — including shorthand properties (`{ Logout }`), re-exports (`export { Logout }`) and JSX usage. Reporting without a fix is preferred over a fix that can corrupt code. Rewrite it by hand, either to `import { LogoutRounded } from '@mui/icons-material'` with its references updated, or to the deep form `import LogoutIcon from '@mui/icons-material/LogoutRounded'`.

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

```ts
// The barrel form is checked too; this one is reported without a fix
import { Logout } from '@mui/icons-material';
```

```ts
// Aliased, so the imported name alone is fixed to LogoutRounded
import { Logout as LogoutIcon } from '@mui/icons-material';
```

```ts
// Only the non-Rounded, non-brand specifiers are reported: Person and AddLink
import { LogoutRounded, Person, GitHub, AddLink } from '@mui/icons-material';
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
// The barrel form, naming Rounded icons
import { LogoutRounded, PersonRounded } from '@mui/icons-material';
```

```ts
// An alias may be anything; only the imported name has to be Rounded
import { AddLinkRounded as AddLinkIcon } from '@mui/icons-material';
```

```ts
// The icon component type is not an icon and has no Rounded counterpart
import type { SvgIconComponent } from '@mui/icons-material';
```

```ts
// An inline type specifier is exempt for the same reason
import { type SvgIconComponent, PersonRounded } from '@mui/icons-material';
```

```ts
// A namespace import names no individual icon
import * as Icons from '@mui/icons-material';
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
