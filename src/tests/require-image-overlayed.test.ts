import { ruleTesterJsx } from '../utils/ruleTester';
import rule from '../rules/require-image-overlayed';

ruleTesterJsx.run('require-image-overlayed', rule, {

  valid: [
    {
      code: `
        import ImageOverlayed from 'src/components/ImageOverlayed';
        function Component() {
          return <ImageOverlayed src="/example.jpg" alt="Example" overlayText="Overlay Text" />;
        }
      `,
    },
    {
      code: `
        import { ImageOverlayed as CustomImage } from 'src/components/ImageOverlayed';
        function Component() {
          return <CustomImage src="/example.jpg" alt="Example" overlayText="Overlay Text" />;
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
          messageId: 'useImageOverlayed',
          data: {
            componentPath: 'src/components/ImageOverlayed',
            component: 'next/image',
          },
        },
      ],
      output: `
        import Image from 'src/components/ImageOverlayed';
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
          messageId: 'useImageOverlayed',
          data: {
            componentPath: 'src/components/ImageOverlayed',
            component: 'img tag',
          },
        },
      ],
      output: `
        function Component() {
          return <ImageOverlayed src="/example.jpg" alt="Example" />;
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
          messageId: 'useImageOverlayed',
          data: {
            componentPath: 'src/components/ImageOverlayed',
            component: 'next/image',
          },
        },
      ],
      output: `
        import NextImage from 'src/components/ImageOverlayed';
        function Component() {
          return <NextImage src="/example.jpg" alt="Example" />;
        }
      `,
    },
  ],
});
