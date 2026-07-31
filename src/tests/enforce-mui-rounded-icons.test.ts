import { ruleTesterTs } from '../utils/ruleTester';
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
      // Renaming the binding would require rewriting every reference, so the
      // unaliased barrel form is reported without a fix.
      code: `import { Logout } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      code: `import { AddReactionOutlined } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // Aliased: only the imported name changes, so the local binding (and
      // every reference to it) is untouched and the fix is safe.
      code: `import { Logout as LogoutIcon } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { LogoutRounded as LogoutIcon } from '@mui/icons-material';`,
    },
    {
      // A redundant alias is not a real alias: the local name still carries the
      // non-Rounded icon name, so no fix is offered.
      code: `import { Logout as Logout } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // The type specifier is exempt; the value specifier is not.
      code: `import { type SvgIconComponent, Logout } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // Only the non-Rounded, non-brand specifiers are reported.
      code: `import { LogoutRounded, Person, GitHub, AddLink } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: null,
    },
    {
      // Variant suffixes map to the Rounded variant of the BASE icon here too.
      code: `import { AddReactionOutlined as AddReactionIcon, DeleteSharp as DeleteIcon, PhoneTwoTone as PhoneIcon } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `import { AddReactionRounded as AddReactionIcon, DeleteRounded as DeleteIcon, PhoneRounded as PhoneIcon } from '@mui/icons-material';`,
    },
    {
      // MailOutline is its own icon in the barrel form as well.
      code: `import { MailOutline as MailIcon } from '@mui/icons-material';`,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: `import { MailOutlineRounded as MailIcon } from '@mui/icons-material';`,
    },
    {
      // A binding reached through shorthand properties and re-exports is
      // exactly why the unaliased form is not auto-fixed: renaming it here
      // would have to rewrite all three sites.
      code: `
        import { Logout } from '@mui/icons-material';
        const icons = { Logout };
        export { Logout };
      `,
      errors: [{ messageId: 'enforceRoundedVariant' }],
      output: null,
    },
    {
      // Only the aliased specifier is fixable; both are still reported.
      code: `import { Logout as LogoutIcon, Person } from '@mui/icons-material';`,
      errors: [
        { messageId: 'enforceRoundedVariant' },
        { messageId: 'enforceRoundedVariant' },
      ],
      output: `import { LogoutRounded as LogoutIcon, Person } from '@mui/icons-material';`,
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
