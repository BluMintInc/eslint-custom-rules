import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

ruleTesterTs.run(
  'enforce-verb-noun-naming-react-component-bug',
  enforceVerbNounNaming,
  {
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
      // The hook-evidence path has to read the same in every spelling of one
      // component. These three carry identical meaning, and the default `.ts`
      // filename keeps them on that path rather than on the blanket
      // PascalCase-in-a-JSX-file arm, so they pin the asymmetry in both
      // directions: wrapping the body in `{ return ... }` or nesting the hook
      // one level deeper must not change the verdict (#2169).
      `import React, { useMemo } from 'react';
const Panel = () => useMemo(() => React.createElement('div'), []);`,
      `import React, { useMemo } from 'react';
const Panel = () => { return useMemo(() => React.createElement('div'), []); };`,
      `import React, { useMemo } from 'react';
const Panel = () => wrap(useMemo(() => React.createElement('div'), []));`,
      // A concise body is the whole expression whichever hook it calls, so the
      // exemption cannot be keyed to one hook's spelling.
      `const Panel = () => useState(false);`,
      `const Panel = () => useCallback(() => {}, []);`,
      `const Panel = () => usePanelState();`,
      // The memoized value stays non-primitive so `no-useless-usememo-primitives`
      // leaves the hook call standing: a fixer that strips the carrier would
      // make this fixture assert nothing about the member-call spelling.
      `const Panel = () => React.useMemo(() => React.createElement('div'), []);`,
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
      // Reading the concise body itself is evidence about that body, not a pass
      // for every terse arrow: a non-hook call is no more a component than the
      // block-bodied version of it would be.
      {
        code: `const Panel = () => compute(x);`,
        errors: [{ messageId: 'functionVerbPhrase' }],
      },
      {
        code: `const Panel = () => store.usage();`,
        errors: [{ messageId: 'functionVerbPhrase' }],
      },
      {
        code: `const Panel = () => usual;`,
        errors: [{ messageId: 'functionVerbPhrase' }],
      },
      // A hook call is evidence only alongside a PascalCase name, so calling one
      // does not buy a lowercase function out of the naming contract.
      {
        code: `import React, { useMemo } from 'react';
const panel = () => useMemo(() => React.createElement('div'), []);`,
        errors: [{ messageId: 'functionVerbPhrase' }],
      },
    ],
  },
);
