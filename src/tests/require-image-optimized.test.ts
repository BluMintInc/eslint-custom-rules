import { ruleTesterJsx } from '../utils/ruleTester';
import rule from '../rules/require-image-optimized';

const IMPORT = `import { ImageOptimized } from 'src/components/image/ImageOptimized';`;

describe('require-image-optimized messages', () => {
  it('provides an educational replacement hint', () => {
    expect(rule.meta.messages.useImageOptimized).toBe(
      'Use ImageOptimized from {{ componentPath }} instead of {{ component }}. The shared wrapper handles responsive sizing, lazy loading, and blur placeholders so images stay optimized and do not hurt Core Web Vitals. Replace this usage with ImageOptimized to send the asset through the optimization pipeline.',
    );
  });
});

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
    // Elements that are not img tags are untouched.
    {
      code: `
function Component() {
  return <picture><source srcSet="/example.webp" /></picture>;
}
`,
    },
    // A member-expression tag is not the intrinsic img element.
    {
      code: `
function Component() {
  return <Html.img src="/example.jpg" alt="Example" />;
}
`,
    },
    // next/image exports other than Image are not the optimization bypass.
    {
      code: `
import { getImageProps } from 'next/image';
export const props = getImageProps({ src: '/example.jpg' });
`,
    },
    // Only next/image itself is flagged, not any module path ending in image.
    {
      code: `
import Image from 'other-lib/image';
export default Image;
`,
    },
    // The jest.mock factory implements ImageOptimized; its img IS the wrapper.
    {
      code: `
jest.mock('../image/ImageOptimized', () => {
  return {
    ImageOptimized: ({ alt }: Readonly<{ alt: string }>) => {
      return <img alt={alt} />;
    },
  } as const;
});
`,
    },
    {
      code: `
jest.mock('../image/ImageOptimized.tsx', () => ({
  ImageOptimized: (props) => <div><img {...props} /></div>,
}));
`,
    },
    {
      code: `
jest.mock('src/components/image/__mocks__/ImageOptimized', () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
`,
    },
    {
      code: `
jest.doMock('../image/ImageOptimized', () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
`,
    },
    {
      code: `
jest.setMock('../image/ImageOptimized', {
  ImageOptimized: () => <img alt="mock" />,
});
`,
    },
    {
      code: `
jest.mock(\`../image/ImageOptimized\`, () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
`,
    },
    // Deep nesting inside the factory stays exempt.
    {
      code: `
jest.mock('../image/ImageOptimized', () => {
  const variants = [
    {
      render: () => {
        return <span><img alt="deep" /></span>;
      },
    },
  ];
  return { ImageOptimized: variants[0].render } as const;
});
`,
    },
    // The component's own module wraps next/image and img by design.
    {
      code: `
import Image from 'next/image';
export const ImageOptimized = (props) => {
  return props.raw ? <img {...props} /> : <Image {...props} />;
};
`,
      filename: 'src/components/image/ImageOptimized.tsx',
    },
    // The manual mock is the component's stand-in implementation.
    {
      code: `
export const ImageOptimized = (props) => <img {...props} />;
`,
      filename: 'src/components/image/__mocks__/ImageOptimized.tsx',
    },
    // A configured componentPath moves the exempt module identity with it.
    {
      code: `
export const OptimizedPicture = (props) => <img {...props} />;
`,
      filename: 'src/components/media/OptimizedPicture.tsx',
      options: [{ componentPath: 'src/components/media/OptimizedPicture' }],
    },
    {
      code: `
jest.mock('../media/OptimizedPicture', () => ({
  OptimizedPicture: () => <img alt="mock" />,
}));
`,
      options: [{ componentPath: 'src/components/media/OptimizedPicture' }],
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
    // Without a binding the swap would strand the name, so the report carries
    // no fix.
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
      output: null,
    },
    {
      code: `
${IMPORT}
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
function Component() {
  return <ImageOptimized src="/example.jpg" alt="Example" />;
}
`,
    },
    {
      code: `
import ImageOptimized from 'src/components/image/ImageOptimized';
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
import ImageOptimized from 'src/components/image/ImageOptimized';
function Component() {
  return <ImageOptimized src="/example.jpg" alt="Example" />;
}
`,
    },
    // An aliased import is reused so the fix references a bound name.
    {
      code: `
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
function Component() {
  return <CustomImage src="/example.jpg" alt="Example" />;
}
`,
    },
    // A type-only import binds no value, so it cannot back a fix.
    {
      code: `
import type { ImageOptimized } from '../image/ImageOptimized';
export type Props = { render: typeof ImageOptimized };
export const Component = () => <img src="/example.jpg" alt="Example" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // The mock exemption is scoped to the mocked module, not to jest.mock.
    {
      code: `
jest.mock('./Banner', () => ({
  Banner: () => <img alt="banner" />,
}));
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    {
      code: `
${IMPORT}
jest.mock('./Banner', () => ({
  Banner: () => <img alt="banner" />,
}));
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
jest.mock('./Banner', () => ({
  Banner: () => <ImageOptimized alt="banner" />,
}));
`,
    },
    // Only the img outside the ImageOptimized factory is a violation.
    {
      code: `
${IMPORT}
jest.mock('../image/ImageOptimized', () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
jest.mock('../image/ImageOptimized', () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
function Component() {
  return <ImageOptimized src="/example.jpg" alt="Example" />;
}
`,
    },
    // A specifier that is not statically knowable cannot prove the module
    // identity the exemption depends on.
    {
      code: `
jest.mock(imagePath, () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // Only jest registers module mocks.
    {
      code: `
registry.mock('../image/ImageOptimized', () => ({
  ImageOptimized: () => <img alt="mock" />,
}));
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // Other jest helpers do not register a module implementation.
    {
      code: `
const renderImage = jest.fn(() => <img alt="mock" />);
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // Plain call wrappers around JSX are not mock registrations.
    {
      code: `
${IMPORT}
it('renders', () => {
  render(<img src="/example.jpg" alt="Example" />);
});
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
it('renders', () => {
  render(<ImageOptimized src="/example.jpg" alt="Example" />);
});
`,
    },
    // Any value binding of the name keeps the swap resolvable.
    {
      code: `
const ImageOptimized = (props) => <div {...props} />;
export const Gallery = () => <img src="/example.jpg" alt="Example" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
const ImageOptimized = (props) => <div {...props} />;
export const Gallery = () => <ImageOptimized src="/example.jpg" alt="Example" />;
`,
    },
    // A namespace import binds the namespace, not the component name.
    {
      code: `
import * as Images from '../image/ImageOptimized';
export const Gallery = () => <img src="/example.jpg" alt="Example" />;
export const first = Images;
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    {
      code: `
${IMPORT}
function Component() {
  return <img />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
function Component() {
  return <ImageOptimized />;
}
`,
    },
    {
      code: `
function Component() {
  return <img />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    {
      code: `
${IMPORT}
function Component({ rest }) {
  return <img {...rest} alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
function Component({ rest }) {
  return <ImageOptimized {...rest} alt="Example" />;
}
`,
    },
    // An explicit closing tag collapses to the self-closing replacement.
    {
      code: `
${IMPORT}
function Component() {
  return <img src="/example.jpg" alt="Example"></img>;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
function Component() {
  return <ImageOptimized src="/example.jpg" alt="Example" />;
}
`,
    },
    {
      code: `
${IMPORT}
function Gallery() {
  return (
    <div>
      <img src="/a.jpg" alt="A" />
      <img src="/b.jpg" alt="B" />
    </div>
  );
}
`,
      errors: [
        { messageId: 'useImageOptimized' },
        { messageId: 'useImageOptimized' },
      ],
      output: `
${IMPORT}
function Gallery() {
  return (
    <div>
      <ImageOptimized src="/a.jpg" alt="A" />
      <ImageOptimized src="/b.jpg" alt="B" />
    </div>
  );
}
`,
    },
    // Both branches report in one pass; only the import swap is safe to apply.
    {
      code: `
import Image from 'next/image';
function Component() {
  return <div><Image src="/a.jpg" alt="A" /><img src="/b.jpg" alt="B" /></div>;
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
        {
          messageId: 'useImageOptimized',
          data: {
            componentPath: 'src/components/image/ImageOptimized',
            component: 'img tag',
          },
        },
      ],
      output: `
import Image from 'src/components/image/ImageOptimized';
function Component() {
  return <div><Image src="/a.jpg" alt="A" /><img src="/b.jpg" alt="B" /></div>;
}
`,
    },
    // The filename exemption matches the module exactly, not by prefix.
    {
      code: `
export const Gallery = () => <img src="/example.jpg" alt="Example" />;
`,
      filename: 'src/components/image/ImageOptimizedGallery.tsx',
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // A suite about the component is a consumer of it, not its implementation.
    {
      code: `
export const fixture = <img src="/example.jpg" alt="Example" />;
`,
      filename: 'src/components/image/ImageOptimized.test.tsx',
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // A configured componentPath surfaces in the message and leaves other
    // files reportable.
    {
      code: `
export const Gallery = () => <img src="/example.jpg" alt="Example" />;
`,
      filename: 'src/components/media/Gallery.tsx',
      options: [{ componentPath: 'src/components/media/OptimizedPicture' }],
      errors: [
        {
          messageId: 'useImageOptimized',
          data: {
            componentPath: 'src/components/media/OptimizedPicture',
            component: 'img tag',
          },
        },
      ],
      output: null,
    },
  ],
});
