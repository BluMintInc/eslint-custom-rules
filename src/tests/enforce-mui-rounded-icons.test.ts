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
  ],
});
