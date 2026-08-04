import { ruleTesterJsx } from '../utils/ruleTester';
import { useCustomLink } from '../rules/use-custom-link';

ruleTesterJsx.run('use-custom-link', useCustomLink, {
  valid: [
    {
      code: `import Link from 'src/components/Link';`,
    },
    {
      code: `import { CustomComponent } from 'src/components/Link';`,
    },
    {
      code: `import Link, { CustomComponent } from 'src/components/Link';`,
    },
    // The integration component the wrapper renders has to keep importing
    // `next/link`: rewriting it manufactures the cycle
    // `Link → NextLinkComposed → Link` (#1673).
    {
      code: `import Link from 'next/link';\nexport const NextLinkComposed = Link;`,
      filename: 'src/components/NextLinkComposed.tsx',
    },
    {
      code: `import Link from 'next/link';\nexport const NextLinkComposed = Link;`,
      filename: '/repo/src/components/NextLinkComposed.tsx',
    },
    // The wrapper module the fixer points at cannot import itself (#1673).
    {
      code: `import Link from 'next/link';\nexport default Link;`,
      filename: 'src/components/Link.tsx',
    },
    {
      code: `import Link from 'next/link';\nexport default Link;`,
      filename: '/repo/src/components/Link.tsx',
    },
    // Both implementation files are exempt under every source extension they can
    // ship as (#1673).
    {
      code: `import Link from 'next/link';`,
      filename: 'src/components/Link.js',
    },
    {
      code: `import Link from 'next/link';`,
      filename: 'src/components/NextLinkComposed.jsx',
    },
    // An extensionless path still identifies the wrapper (#1673).
    {
      code: `import Link from 'next/link';`,
      filename: '/repo/src/components/Link',
    },
    // Windows separators name the same modules as POSIX ones (#1673).
    {
      code: `import Link from 'next/link';\nexport default Link;`,
      filename: 'C:\\repo\\src\\components\\Link.tsx',
    },
    {
      code: `import Link from 'next/link';\nexport const NextLinkComposed = Link;`,
      filename: 'C:\\repo\\src\\components\\NextLinkComposed.tsx',
    },
  ],
  invalid: [
    {
      code: `import Link from 'next/link';`,
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
      output: `import Link from 'src/components/Link';`,
    },
    {
      code: `import { default as NextLink } from 'next/link';`,
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'NextLink' },
        },
      ],
      output: `import NextLink from 'src/components/Link';`,
    },
    // A consumer of the wrapper is reported however the wrapper's own
    // implementation files are exempted (#1673).
    {
      code: `import Link from 'next/link';`,
      output: `import Link from 'src/components/Link';`,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    // `notsrc` is a different segment from `src`, so the path names a different
    // module and stays reportable (#1673).
    {
      code: `import Link from 'next/link';`,
      output: `import Link from 'src/components/Link';`,
      filename: 'foo/notsrc/components/Link.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    // A longer basename sharing the wrapper's prefix is a different module
    // (#1673).
    {
      code: `import Link from 'next/link';`,
      output: `import Link from 'src/components/Link';`,
      filename: 'src/components/LinkButton.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    // The integration component is matched by basename equality, so a longer
    // name ending in it is a different module (#1673).
    {
      code: `import Link from 'next/link';`,
      output: `import Link from 'src/components/Link';`,
      filename: 'src/components/MyNextLinkComposed.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    // Only the final extension is stripped, so `NextLinkComposed.stories` never
    // reduces to `NextLinkComposed` (#1673).
    {
      code: `import Link from 'next/link';`,
      output: `import Link from 'src/components/Link';`,
      filename: 'src/components/NextLinkComposed.stories.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
  ],
});
