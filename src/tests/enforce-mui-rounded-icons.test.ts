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
  ],
});
