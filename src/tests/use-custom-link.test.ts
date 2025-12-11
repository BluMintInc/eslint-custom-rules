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
  ],
});
