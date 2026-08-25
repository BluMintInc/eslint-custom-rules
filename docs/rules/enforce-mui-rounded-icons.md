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
| `import LogoutIcon from '@mui/icons-material/Logout'` | Yes — the module specifier becomes `'@mui/icons-material/LogoutRounded'`. The binding names the icon's role rather than its variant, so it stays as it is. |
| `import PersonOutlined from '@mui/icons-material/PersonOutlined'` | Yes — the module specifier becomes `'@mui/icons-material/PersonRounded'` **and** the binding becomes `PersonRounded`, along with every reference to it. |
| `import { Logout as LogoutIcon } from '@mui/icons-material'` | Yes — only the **imported** name becomes `LogoutRounded`; the local binding `LogoutIcon` and every reference to it are untouched. |
| `import { Logout } from '@mui/icons-material'` | Yes — the single token spells both the imported name and the binding, so it becomes `LogoutRounded` together with every reference to it. |

#### The binding moves with the icon

A binding that repeats the icon name describes the glyph it renders. Retargeting the module while leaving that name behind produces code that compiles and lies: `import PersonOutlined from '@mui/icons-material/PersonRounded'` renders the Rounded glyph under the Outlined name, and every reader of the diff sees the wrong variant. So whenever the name being replaced is also the local binding, the fix renames the binding and each in-file reference to it — JSX tags (both halves of `<PersonOutlined></PersonOutlined>`), type positions, prop values and plain expressions alike. The module change and the rename are emitted as one fix, so the binding can never move without the retarget that motivates it, or the reverse.

Only name tokens are rewritten, resolved through the scope manager rather than by matching text, so an unrelated identifier that happens to share the name is left alone.

#### When the rename is declined

Where the rename cannot be applied in full, the fix falls back to changing the module path alone — and the unaliased barrel form, which has no path to change apart from the binding, is reported without a fix. The rename is declined when:

- **The binding is an alias.** `import BellIcon from '@mui/icons-material/NotificationsActiveOutlined'` names the icon's role, not its variant, so it is a deliberate choice the fix has no standing to overwrite. Only a binding equal to the icon name being replaced is renamed.
- **The binding is re-exported.** `export { PersonOutlined }` (aliased or not) makes the name part of the module's public API, and a single-file fix cannot rewrite the importers that name it.
- **The new name is already taken.** A binding, or a use of that name in any scope the rename reaches, would be redeclared or shadowed. Two variants of one icon in the same file — `PersonOutlined` and `PersonSharp`, both retargeting to `PersonRounded` — contest the same name, so neither binding is renamed.
- **A reference is an object shorthand.** `{ PersonOutlined }` is a single token serving as both the property key and its value; renaming it would rename the key too, and expanding it to `PersonOutlined: PersonRounded` reshapes source well beyond the import.
- **A JSX tag names the binding through a compound name.** `<PersonOutlined.Sub />` reaches the binding through a member expression whose closing half the scope manager does not expose, so the two tags cannot be kept in sync.

A file holding several renameable icon imports converges over successive `--fix` passes: each report owns a range spanning its import and its last reference, and ESLint applies one of a pair of overlapping ranges per pass.

### An import the renames widen is broken open

A rename only ever *lengthens* a specifier — `Person` becomes `PersonRounded` — so an import that fitted on one line before the fix may not after it, and a formatter's answer to an over-wide import is one specifier per line. The fix emits that shape itself rather than leave the break for the formatter's next run:

```ts
// Before
import { LogoutRounded, Person, GitHub, AddLink } from '@mui/icons-material';

// After --fix
import {
  LogoutRounded,
  PersonRounded,
  GitHub,
  AddLinkRounded,
} from '@mui/icons-material';
```

The width is measured across *all* the renames the declaration calls for, not one at a time, and an import that still fits keeps its single-line shape. A declaration already written across lines is left as it is.

Breaking the group open rebuilds it, which would delete a comment written between the specifiers — so a declaration carrying one is reported without a rewrite rather than fixed over the width.

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
// The binding repeats the icon name, so it is renamed with the path:
// import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
// export const bell = NotificationsActiveRounded;
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
export const bell = NotificationsActiveOutlined;
```

```ts
// The barrel form is checked too; the single token becomes LogoutRounded
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
// A binding matching its Rounded icon is what the fix converges on
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
export const bell = NotificationsActiveRounded;
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
