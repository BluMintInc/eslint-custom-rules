import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

ruleTesterTs.run('enforce-verb-noun-naming-react-component-bug', enforceVerbNounNaming, {
  valid: [
    // This should be valid because it's a React component (BracketAd)
    {
      code: `
      import Stack from '@mui/material/Stack';
      import {
        LARGE_RECTANGLE,
        STACK_DISPLAY,
      } from '../../../../functions/src/util/ads/AdDimension';
      import { BRACKET_AD } from '../../../../functions/src/util/ads/adIds';
      import { Ad } from '../../ads/Ad';

      export function BracketAd() {
        return (
          <Stack
            alignItems={'center'}
            display={STACK_DISPLAY}
            justifyContent={'center'}
            pt={4}
          >
            <Ad id={BRACKET_AD} {...LARGE_RECTANGLE} />
          </Stack>
        );
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // Simple React component with PascalCase name
    {
      code: `
      export function UserProfile() {
        return <div>User Profile</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // React component with props
    {
      code: `
      export function TeamCard({ team }) {
        return <div>{team.name}</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    }
  ],
  invalid: [],
});
