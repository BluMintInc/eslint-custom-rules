import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { enforceMuiRoundedIcons } from '../rules/enforce-mui-rounded-icons';

ruleTesterTs.run('enforce-mui-rounded-icons', enforceMuiRoundedIcons, {
  valid: [
    {
      code: `import LogoutIcon from '@mui/icons-material/LogoutRounded';`,
    },
    {
      code: `import AddLinkIcon from '@mui/icons-material/AddLinkRounded';`,
    },
    {
      code: `import PersonIcon from '@mui/icons-material/PersonRounded';`,
    },
    {
      // Non-MUI imports should be ignored
      code: `import { SomeIcon } from 'some-other-library';`,
    },
    {
      // Dynamic imports should be ignored
      code: `const iconName = 'Logout'; const IconComponent = React.lazy(() => import(\`@mui/icons-material/\${iconName}\`));`,
    },
    // Issue #1218: brand icons have no Rounded variant — must not be flagged.
    {
      code: `import GoogleIcon from '@mui/icons-material/Google';`,
    },
    {
      code: `import AppleIcon from '@mui/icons-material/Apple';`,
    },
    {
      code: `import GitHubIcon from '@mui/icons-material/GitHub';`,
    },
    {
      code: `import XIcon from '@mui/icons-material/X';`,
    },
    // Issue #1502: the barrel import form is checked too.
    {
      code: `import { LogoutRounded } from '@mui/icons-material';`,
    },
    {
      code: `import { LogoutRounded as LogoutIcon } from '@mui/icons-material';`,
    },
    {
      code: `import { MailOutlineRounded } from '@mui/icons-material';`,
    },
    {
      // The real shape found in consumer code: a type-only import of the icon
      // component type. Not an icon, and a type can never be rendered.
      code: `import type { SvgIconComponent } from '@mui/icons-material';`,
    },
    {
      // Same export imported in value position: still not an icon.
      code: `import { SvgIconComponent } from '@mui/icons-material';`,
    },
    {
      // A type-only declaration cannot introduce a rendered icon.
      code: `import type { Logout } from '@mui/icons-material';`,
    },
    {
      // Inline type specifiers are type-only too.
      code: `import { type Logout } from '@mui/icons-material';`,
    },
    {
      // Brand icons have no Rounded counterpart in either import form.
      code: `import { Google, Apple, GitHub, X } from '@mui/icons-material';`,
    },
    {
      // A namespace import exposes every icon; member usage is out of scope.
      code: `import * as Icons from '@mui/icons-material';`,
    },
    {
      code: `import '@mui/icons-material';`,
    },
    {
      // Another @mui package that happens to export icon-like names.
      code: `import { Logout } from '@mui/material';`,
    },
    {
      // Prefix collision: a different package whose name starts the same way.
      code: `import { Logout } from '@mui/icons-material-extra';`,
    },
    {
      // The barrel has no default export naming an icon.
      code: `import Icons from '@mui/icons-material';`,
    },
    {
      // A trailing slash names no icon.
      code: `import Icon from '@mui/icons-material/';`,
    },
    {
      code: `
        import { LogoutRounded as LogoutIcon, PersonRounded } from '@mui/icons-material';
        import AddLinkIcon from '@mui/icons-material/AddLinkRounded';
      `,
    },
    // Issue #1674: the fixed forms below are the outputs the invalid cases
    // expect. Reporting nothing on them is what makes the fix idempotent — a
    // second `--fix` pass has nothing left to change.
    {
      code: `
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
export const x = NotificationsActiveRounded;
`,
    },
    {
      code: `
import PersonRounded from '@mui/icons-material/PersonRounded';
const icons = { PersonRounded };
export { PersonRounded };
`,
    },
    {
      code: `import { LogoutRounded as LogoutRounded } from '@mui/icons-material';`,
    },
    {
      code: `
import { PersonRounded } from '@mui/icons-material';
export const x = PersonRounded;
`,
    },
  ],
  invalid: [
    {
      code: `import LogoutIcon from '@mui/icons-material/Logout';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import LogoutIcon from '@mui/icons-material/LogoutRounded';`,
    },
    {
      code: `import AddLinkIcon from '@mui/icons-material/AddLink';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import AddLinkIcon from '@mui/icons-material/AddLinkRounded';`,
    },
    {
      code: `import PersonIcon from '@mui/icons-material/Person';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import PersonIcon from '@mui/icons-material/PersonRounded';`,
    },
    {
      // Multiple imports in one file
      code: `
        import LogoutIcon from '@mui/icons-material/Logout';
        import AddLinkIcon from '@mui/icons-material/AddLink';
      `,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `
        import LogoutIcon from '@mui/icons-material/LogoutRounded';
        import AddLinkIcon from '@mui/icons-material/AddLinkRounded';
      `,
    },
    // Issue #1218: a non-Rounded variant maps to the Rounded variant of the
    // BASE name, not <name><variant>Rounded (which doesn't exist).
    {
      code: `import AddReactionIcon from '@mui/icons-material/AddReactionOutlined';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import AddReactionIcon from '@mui/icons-material/AddReactionRounded';`,
    },
    {
      code: `import DeleteIcon from '@mui/icons-material/DeleteSharp';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import DeleteIcon from '@mui/icons-material/DeleteRounded';`,
    },
    {
      code: `import PhoneIcon from '@mui/icons-material/PhoneTwoTone';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import PhoneIcon from '@mui/icons-material/PhoneRounded';`,
    },
    {
      // MailOutline is a distinct icon (not the Outlined variant of Mail); its
      // Rounded variant MailOutlineRounded exists, so enforcement still applies.
      code: `import MailIcon from '@mui/icons-material/MailOutline';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import MailIcon from '@mui/icons-material/MailOutlineRounded';`,
    },
    // Issue #1502: the barrel import form bypassed the rule entirely.
    {
      // Issue #1674: the unaliased barrel form spells the imported name and the
      // local binding with one token, so the fix renames the binding. With no
      // reference to rewrite, the single token moves.
      code: `import { Logout } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { LogoutRounded } from '@mui/icons-material';`,
    },
    {
      code: `import { AddReactionOutlined } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { AddReactionRounded } from '@mui/icons-material';`,
    },
    {
      // Aliased: only the imported name changes, so the local binding (and
      // every reference to it) is untouched and the fix is safe.
      code: `import { Logout as LogoutIcon } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { LogoutRounded as LogoutIcon } from '@mui/icons-material';`,
    },
    {
      // A redundant alias is not a real alias: the local name carries the
      // non-Rounded icon name too, so both tokens move. Each keeps its own
      // range, which leaves the redundancy the source already had rather than
      // collapsing a span that may hold comments.
      code: `import { Logout as Logout } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { LogoutRounded as LogoutRounded } from '@mui/icons-material';`,
    },
    {
      // The type specifier is exempt; the value specifier is not.
      code: `import { type SvgIconComponent, Logout } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { type SvgIconComponent, LogoutRounded } from '@mui/icons-material';`,
    },
    {
      // Only the non-Rounded, non-brand specifiers are reported.
      code: `import { LogoutRounded, Person, GitHub, AddLink } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      // A rename only ever LENGTHENS the specifier, so an import that fitted
      // on one line may not after the fix — and a formatter's answer to an
      // over-wide import is one specifier per line. Emitting the long line
      // would leave that break for the formatter's next run (#2117).
      output: `import {
  LogoutRounded,
  PersonRounded,
  GitHub,
  AddLinkRounded,
} from '@mui/icons-material';`,
    },
    {
      // Variant suffixes map to the Rounded variant of the BASE icon here too.
      code: `import { AddReactionOutlined as AddReactionIcon, DeleteSharp as DeleteIcon, PhoneTwoTone as PhoneIcon } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `import {
  AddReactionRounded as AddReactionIcon,
  DeleteRounded as DeleteIcon,
  PhoneRounded as PhoneIcon,
} from '@mui/icons-material';`,
    },
    {
      // MailOutline is its own icon in the barrel form as well.
      code: `import { MailOutline as MailIcon } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { MailOutlineRounded as MailIcon } from '@mui/icons-material';`,
    },
    {
      // A binding reached through shorthand properties and re-exports cannot be
      // renamed: the shorthand token is both key and value, and the export
      // specifier is a cross-file contract. The unaliased barrel form has no
      // rename-free fix, so it is reported without one.
      code: `
        import { Logout } from '@mui/icons-material';
        const icons = { Logout };
        export { Logout };
      `,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // Both specifiers are fixable: the aliased one by its imported name, the
      // bare one by renaming its binding.
      code: `import { Logout as LogoutIcon, Person } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `import {
  LogoutRounded as LogoutIcon,
  PersonRounded,
} from '@mui/icons-material';`,
    },
    {
      // Breaking the group open rebuilds it, which would delete a comment
      // written between the specifiers. The rewrite is declined rather than
      // emitted over the width, so the report stands on its own and the source
      // is left untouched (#2117).
      code: `import { Logout as LogoutIcon, /* keep */ Person } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: null,
    },
    {
      // The control for the width gate: an import that still fits keeps its
      // single-line shape, so the rename stays a rename.
      code: `import { Person } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { PersonRounded } from '@mui/icons-material';`,
    },
    {
      // A default import alongside named specifiers.
      code: `import Icons, { Logout as LogoutIcon } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import Icons, { LogoutRounded as LogoutIcon } from '@mui/icons-material';`,
    },
    {
      // Comments and line breaks between specifiers.
      code: `
        import {
          // the sign-out icon
          Logout as LogoutIcon,
          PersonRounded,
        } from '@mui/icons-material';
      `,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
        import {
          // the sign-out icon
          LogoutRounded as LogoutIcon,
          PersonRounded,
        } from '@mui/icons-material';
      `,
    },
    {
      // Issue #1674 repro: the binding must not keep the variant name the fix
      // just removed from the path.
      code: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
export const x = NotificationsActiveOutlined;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
export const x = NotificationsActiveRounded;
`,
    },
    {
      // Issue #1674: nothing references the binding, so the rename is the
      // declaration alone.
      code: `import PersonOutlined from '@mui/icons-material/PersonOutlined';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import PersonRounded from '@mui/icons-material/PersonRounded';`,
    },
    {
      // A binding repeating a suffix-free icon name is renamed on the same
      // terms: the name still describes the glyph the path names.
      code: `
import Logout from '@mui/icons-material/Logout';
export const x = Logout;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import LogoutRounded from '@mui/icons-material/LogoutRounded';
export const x = LogoutRounded;
`,
    },
    {
      // Every reference moves, wherever it sits: nested scopes, type positions
      // and the default export included.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
type Rendered = typeof PersonOutlined;
function render(): Rendered {
  const local = PersonOutlined;
  return local;
}
export default PersonOutlined;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonRounded from '@mui/icons-material/PersonRounded';
type Rendered = typeof PersonRounded;
function render(): Rendered {
  const local = PersonRounded;
  return local;
}
export default PersonRounded;
`,
    },
    // Issue #1674 safety conditions: each of these keeps the path-only fix.
    {
      // A hand-chosen alias names the icon's role, not its variant, so it is
      // left alone.
      code: `
import BellIcon from '@mui/icons-material/NotificationsActiveOutlined';
export const x = BellIcon;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import BellIcon from '@mui/icons-material/NotificationsActiveRounded';
export const x = BellIcon;
`,
    },
    {
      // A re-exported binding is part of the module's public API, which a
      // single-file rename cannot carry to the importers.
      code: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
export { NotificationsActiveOutlined };
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveRounded';
export { NotificationsActiveOutlined };
`,
    },
    {
      // An aliased re-export names the same public contract.
      code: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
export { NotificationsActiveOutlined as Bell };
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveRounded';
export { NotificationsActiveOutlined as Bell };
`,
    },
    {
      // The Rounded name is already bound, so renaming onto it would redeclare
      // it.
      code: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
const NotificationsActiveRounded = 1;
export const x = [NotificationsActiveOutlined, NotificationsActiveRounded];
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveRounded';
const NotificationsActiveRounded = 1;
export const x = [NotificationsActiveOutlined, NotificationsActiveRounded];
`,
    },
    {
      // The Rounded name is bound in a nested scope, where the renamed binding
      // would be shadowed.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
function render() {
  const PersonRounded = 1;
  return PersonRounded;
}
export const x = [PersonOutlined, render];
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonOutlined from '@mui/icons-material/PersonRounded';
function render() {
  const PersonRounded = 1;
  return PersonRounded;
}
export const x = [PersonOutlined, render];
`,
    },
    {
      // A shorthand property is one token serving as both key and value:
      // renaming it would silently rename the key too.
      code: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
const o = { NotificationsActiveOutlined };
export const x = o;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveRounded';
const o = { NotificationsActiveOutlined };
export const x = o;
`,
    },
    {
      // An explicit key is not shorthand, so only the value moves.
      code: `
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
export const o = { bell: NotificationsActiveOutlined };
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
export const o = { bell: NotificationsActiveRounded };
`,
    },
    {
      // Two variants of one icon both retarget to the same Rounded name, so
      // renaming both bindings would declare that name twice.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PersonSharp from '@mui/icons-material/PersonSharp';
export const x = [PersonOutlined, PersonSharp];
`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `
import PersonOutlined from '@mui/icons-material/PersonRounded';
import PersonSharp from '@mui/icons-material/PersonRounded';
export const x = [PersonOutlined, PersonSharp];
`,
    },
    {
      // Two renames in one file: each report carries its own path change plus
      // its own reference rewrites, so ESLint merges each report into a range
      // spanning its import and its last reference. Those ranges overlap, so a
      // single pass lands one report's fix and `--fix` converges on the next
      // pass (this pins the first pass).
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
export const x = [PersonOutlined, LogoutOutlined];
`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `
import PersonRounded from '@mui/icons-material/PersonRounded';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
export const x = [PersonRounded, LogoutOutlined];
`,
    },
    {
      // A side-effect import binds nothing, so only the path moves.
      code: `import '@mui/icons-material/PersonOutlined';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import '@mui/icons-material/PersonRounded';`,
    },
    {
      // A namespace binding names the module, not the icon, so it is left
      // alone.
      code: `
import * as PersonOutlined from '@mui/icons-material/PersonOutlined';
export const x = PersonOutlined;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import * as PersonOutlined from '@mui/icons-material/PersonRounded';
export const x = PersonOutlined;
`,
    },
    // Issue #1674: the unaliased barrel form renames its binding on the same
    // terms as the deep form.
    {
      code: `
import { PersonOutlined } from '@mui/icons-material';
export const x = PersonOutlined;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import { PersonRounded } from '@mui/icons-material';
export const x = PersonRounded;
`,
    },
    {
      // Re-export: the barrel form declines for the same public-API reason, and
      // has no rename-free fix to fall back on.
      code: `
import { PersonOutlined } from '@mui/icons-material';
export { PersonOutlined };
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // Collision: the barrel form declines too.
      code: `
import { PersonOutlined } from '@mui/icons-material';
const PersonRounded = 1;
export const x = [PersonOutlined, PersonRounded];
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // Contested target: two barrel specifiers claiming one Rounded name.
      code: `
import { PersonOutlined, PersonSharp } from '@mui/icons-material';
export const x = [PersonOutlined, PersonSharp];
`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: null,
    },
    {
      // Both import forms in one file.
      code: `
        import PersonIcon from '@mui/icons-material/Person';
        import { Logout as LogoutIcon } from '@mui/icons-material';
      `,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `
        import PersonIcon from '@mui/icons-material/PersonRounded';
        import { LogoutRounded as LogoutIcon } from '@mui/icons-material';
      `,
    },
  ],
});

/**
 * Issue #1674: an icon binding is overwhelmingly used as a JSX element, and the
 * scope manager exposes those uses differently — the opening tag's name is a
 * reference while the closing tag's is not — so the rename is pinned against
 * real JSX rather than expression positions alone.
 */
ruleTesterJsx.run('enforce-mui-rounded-icons (jsx)', enforceMuiRoundedIcons, {
  valid: [
    {
      code: `
import PersonRounded from '@mui/icons-material/PersonRounded';
export const Icon = () => <PersonRounded fontSize="small" />;
`,
    },
    {
      // The fixed form of the closing-tag case below: idempotent.
      code: `
import PersonRounded from '@mui/icons-material/PersonRounded';
export const Icon = () => <PersonRounded></PersonRounded>;
`,
    },
  ],
  invalid: [
    {
      // The binding is renamed in JSX and in a plain expression alike.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
export const Icon = () => <PersonOutlined fontSize="small" />;
export const raw = PersonOutlined;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonRounded from '@mui/icons-material/PersonRounded';
export const Icon = () => <PersonRounded fontSize="small" />;
export const raw = PersonRounded;
`,
    },
    {
      // A closing tag must move with its opening tag or the element stops
      // parsing.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
export const Icon = () => <PersonOutlined>{'label'}</PersonOutlined>;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonRounded from '@mui/icons-material/PersonRounded';
export const Icon = () => <PersonRounded>{'label'}</PersonRounded>;
`,
    },
    {
      // Nested elements each carry their own closing tag.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
export const Icons = () => (
  <div>
    <PersonOutlined />
    <PersonOutlined color="primary"></PersonOutlined>
  </div>
);
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonRounded from '@mui/icons-material/PersonRounded';
export const Icons = () => (
  <div>
    <PersonRounded />
    <PersonRounded color="primary"></PersonRounded>
  </div>
);
`,
    },
    {
      // Passed as a prop value rather than rendered.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
export const Row = () => <Item icon={PersonOutlined} />;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonRounded from '@mui/icons-material/PersonRounded';
export const Row = () => <Item icon={PersonRounded} />;
`,
    },
    {
      // A compound tag name reaches the binding through a member expression,
      // whose closing half the scope manager does not expose, so the rename is
      // declined and the path alone moves.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
export const Icon = () => <PersonOutlined.Sub></PersonOutlined.Sub>;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonOutlined from '@mui/icons-material/PersonRounded';
export const Icon = () => <PersonOutlined.Sub></PersonOutlined.Sub>;
`,
    },
    {
      // A JSX-rendered binding from the barrel form renames the same way.
      code: `
import { PersonOutlined } from '@mui/icons-material';
export const Icon = () => <PersonOutlined />;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import { PersonRounded } from '@mui/icons-material';
export const Icon = () => <PersonRounded />;
`,
    },
    {
      // A shorthand property still declines even when the other reference is
      // JSX: the whole rename is refused, not the shorthand site alone.
      code: `
import PersonOutlined from '@mui/icons-material/PersonOutlined';
const registry = { PersonOutlined };
export const Icon = () => <PersonOutlined registry={registry} />;
`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `
import PersonOutlined from '@mui/icons-material/PersonRounded';
const registry = { PersonOutlined };
export const Icon = () => <PersonOutlined registry={registry} />;
`,
    },
  ],
});
