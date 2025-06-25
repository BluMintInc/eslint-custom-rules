import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

ruleTesterTs.run('enforce-verb-noun-naming-react-component-bug', enforceVerbNounNaming, {
  valid: [
    // This is the exact code from the bug report - should be valid
    {
      code: `import Stack from '@mui/material/Stack';
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
    // Additional React component test cases
    {
      code: `function UserProfile() {
        return <div>User Profile</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `function DataTable() {
        return (
          <table>
            <tr><td>Data</td></tr>
          </table>
        );
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `const NavigationBar = () => {
        return <nav>Navigation</nav>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `const HeaderComponent = () => (
        <header>
          <h1>Title</h1>
        </header>
      )`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // React components with complex JSX
    {
      code: `function ComplexComponent() {
        const element = <div>Complex</div>;
        return element;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // React components with conditional JSX
    {
      code: `function ConditionalComponent({ show }) {
        if (show) {
          return <div>Shown</div>;
        }
        return null;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  ],
  invalid: [
    // Non-React functions should still be flagged
    {
      code: `function userData() {
        return { name: 'John' };
      }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
    {
      code: `const customerInfo = () => {
        return { name: 'John', email: 'john@example.com' };
      }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
  ],
});
