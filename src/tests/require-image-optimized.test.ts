import { ruleTesterJsx } from '../utils/ruleTester';
import rule from '../rules/require-image-optimized';

ruleTesterJsx.run('require-image-optimized', rule, {
  valid: [
    {
      code: `
        import ImageOptimized from 'src/components/image/ImageOptimized';
        function Component() {
          return <ImageOptimized src="/example.jpg" alt="Example" />;
        }
      `,
    },
    {
      code: `
        import { ImageOptimized as CustomImage } from 'src/components/image/ImageOptimized';
        function Component() {
          return <CustomImage src="/example.jpg" alt="Example" />;
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        import Image from 'next/image';
        function Component() {
          return <Image src="/example.jpg" alt="Example" />;
        }
      `,
      errors: [
        {
          messageId: 'useImageOptimized',
          data: {
            componentPath: 'src/components/image/ImageOptimized',
            component: 'next/image',
          },
        },
      ],
      output: `
        import Image from 'src/components/image/ImageOptimized';
        function Component() {
          return <Image src="/example.jpg" alt="Example" />;
        }
      `,
    },
    {
      code: `
        function Component() {
          return <img src="/example.jpg" alt="Example" />;
        }
      `,
      errors: [
        {
          messageId: 'useImageOptimized',
          data: {
            componentPath: 'src/components/image/ImageOptimized',
            component: 'img tag',
          },
        },
      ],
      output: `
        function Component() {
          return <ImageOptimized src="/example.jpg" alt="Example" />;
        }
      `,
    },
    {
      code: `
        import { Image as NextImage } from 'next/image';
        function Component() {
          return <NextImage src="/example.jpg" alt="Example" />;
        }
      `,
      errors: [
        {
          messageId: 'useImageOptimized',
          data: {
            componentPath: 'src/components/image/ImageOptimized',
            component: 'next/image',
          },
        },
      ],
      output: `
        import NextImage from 'src/components/image/ImageOptimized';
        function Component() {
          return <NextImage src="/example.jpg" alt="Example" />;
        }
      `,
    },
  ],
});
