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

    // ─── Imports carrying a specifier the fix cannot rebuild ────────────────
    // The report stands, but rewriting would delete the extra specifier and
    // leave its references dangling, so no fix is offered (#2272). The shape is
    // real: agora's own NextLinkComposed.tsx writes `import NextLink,
    // { LinkProps as NextLinkProps } from 'next/link'`.
    {
      // A re-exported type keeps the exported NAME while losing its binding,
      // which is why an export-surface comparison cannot see the damage.
      code: [
        `import Link, { LinkProps } from 'next/link';`,
        `export type { LinkProps };`,
      ].join('\n'),
      output: null,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    {
      // A value specifier still called by an exported function
      code: [
        `import Link, { useLinkStatus } from 'next/link';`,
        `export const B = () => useLinkStatus();`,
      ].join('\n'),
      output: null,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    {
      // Aliased named specifier
      code: [
        `import Link, { LinkProps as LP } from 'next/link';`,
        `export type X = LP;`,
      ].join('\n'),
      output: null,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    {
      // `default as` alongside a named specifier reaches the same branch
      code: `import { default as NextLink, LinkProps } from 'next/link';`,
      output: null,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'NextLink' },
        },
      ],
    },
    {
      // A namespace specifier is dropped by the same reconstruction
      code: `import Link, * as NextLinkAll from 'next/link';`,
      output: null,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
    {
      // Control: nothing to drop, so the fix must still be offered. Pairs with
      // the cases above so a blanket decline fails here rather than passing.
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
    {
      // Control: the sole specifier is `default as`, so it is rebuilt, not lost
      code: `import { default as NextLink } from 'next/link';`,
      output: `import NextLink from 'src/components/Link';`,
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'NextLink' },
        },
      ],
    },
    {
      // A default-only import beside a declaration this module already
      // exports: the fixer rewrites only the `ImportDeclaration`'s source and
      // must leave `HOME_ROUTE` exported exactly as written.
      code: [
        `import Link from 'next/link';`,
        `export const HOME_ROUTE = '/';`,
      ].join('\n'),
      output: [
        `import Link from 'src/components/Link';`,
        `export const HOME_ROUTE = '/';`,
      ].join('\n'),
      filename: 'src/components/Foo.tsx',
      errors: [
        {
          messageId: 'useCustomLink',
          data: { localName: 'Link' },
        },
      ],
    },
  ],
});
