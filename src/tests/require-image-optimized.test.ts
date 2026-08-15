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
    // A type-only import renders nothing, so it bypasses no optimization.
    {
      code: `
import type Image from 'next/image';
export type T = typeof Image;
`,
    },
    {
      code: `
import type { ImageProps } from 'next/image';
export type Props = ImageProps;
`,
    },
    // A specifier-level type modifier binds no value either.
    {
      code: `
import { type Image as NextImage } from 'next/image';
export type Props = { render: typeof NextImage };
`,
    },
    {
      code: `
import type { default as Picture } from 'next/image';
export type Props = { render: typeof Picture };
`,
    },
    // A namespace import is deliberately out of scope: it binds the module, not
    // the component, and is consumed as <NextImage.default />.
    {
      code: `
import * as NextImage from 'next/image';
export const C = () => <NextImage.default src="/a.jpg" alt="A" />;
`,
    },
    // The component's own module imports next/image by design, however many
    // specifiers the import carries.
    {
      code: `
import Image, { ImageProps } from 'next/image';
export const ImageOptimized = (props: ImageProps) => <Image {...props} />;
`,
      filename: 'src/components/image/ImageOptimized.tsx',
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
    // The props-spread factory is the module's implementation, so its img is
    // the wrapper itself rather than a bypass of it.
    {
      code: `
jest.mock('src/components/image/ImageOptimized', () => ({
  ImageOptimized: (props) => <img {...props} />,
}));
`,
    },
    // The wrapper's own definition renders the image primitive; rewriting it
    // would make the component render itself.
    {
      code: `
type ImageOptimizedProps = { src: string; alt: string; width: number; height: number };
const ImageOptimized = ({ src, alt }: ImageOptimizedProps) => <img src={src} alt={alt} />;
`,
    },
    // A memo/forwardRef wrapper around the body leaves the declaration name
    // unchanged, so the definition is still recognized.
    {
      code: `
const ImageOptimized = memo(({ src, alt }) => <img src={src} alt={alt} />);
`,
    },
    {
      code: `
const ImageOptimized = forwardRef((props, ref) => <img ref={ref} {...props} />);
`,
    },
    // The function-declaration spelling of the same definition.
    {
      code: `
function ImageOptimized({ src, alt }) {
  return <img src={src} alt={alt} />;
}
`,
    },
    {
      code: `
export default function ImageOptimized({ src, alt }) {
  return <img src={src} alt={alt} />;
}
`,
    },
    // The class spellings, declaration and default-exported alike.
    {
      code: `
class ImageOptimized extends React.Component {
  render() {
    return <img src={this.props.src} alt={this.props.alt} />;
  }
}
`,
    },
    {
      code: `
export default class ImageOptimized extends React.Component {
  render() {
    return <img {...this.props} />;
  }
}
`,
    },
    // A helper nested inside the definition is part of that implementation.
    {
      code: `
export const ImageOptimized = (props) => {
  const Raw = () => <img {...props} />;
  return <Raw />;
};
`,
    },
    // The definition is recognized wherever the file sits, since the module it
    // lives in can be named anything.
    {
      code: `
export const ImageOptimized = (props) => <img {...props} />;
`,
      filename: 'src/components/media/Picture.tsx',
    },
    // A locally named wrapper exported under the component's name is the same
    // definition written differently.
    {
      code: `
const Picture = ({ src, alt }) => <img src={src} alt={alt} />;
export { Picture as ImageOptimized };
`,
      filename: 'src/components/media/Picture.tsx',
    },
    // A configured componentPath moves the exempt declaration name with it.
    {
      code: `
export const OptimizedPicture = (props) => <img {...props} />;
`,
      filename: 'src/components/media/Picture.tsx',
      options: [{ componentPath: 'src/components/media/OptimizedPicture' }],
    },
    // The filename exemption holds however deeply the img is nested inside the
    // component's own module.
    {
      code: `
export const ImageOptimized = (props) => {
  const Inner = () => <img {...props} />;
  return <Inner />;
};
`,
      filename: 'src/components/image/ImageOptimized.tsx',
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
    // The default export IS the component whatever it is bound to locally, so
    // renaming it away from Image is no escape.
    {
      code: `
import Img from 'next/image';
export const C = () => <Img src="/a.jpg" alt="A" />;
`,
      output: `
import Img from 'src/components/image/ImageOptimized';
export const C = () => <Img src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // The named form of the default export is the same binding.
    {
      code: `
import { default as Picture } from 'next/image';
export const C = () => <Picture src="/a.jpg" alt="A" />;
`,
      output: `
import Picture from 'src/components/image/ImageOptimized';
export const C = () => <Picture src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // Sibling specifiers keep their original source, so the fix strands no
    // reference.
    {
      code: `
import Image, { ImageProps } from 'next/image';
type Props = { opts: ImageProps };
export const C = ({ opts }: Props) => <Image {...opts} src="/a.jpg" alt="A" />;
`,
      output: `
import { ImageProps } from 'next/image';
import Image from 'src/components/image/ImageOptimized';
type Props = { opts: ImageProps };
export const C = ({ opts }: Props) => <Image {...opts} src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // The split preserves each surviving specifier verbatim, including its
    // alias and its type modifier.
    {
      code: `
import NextImage, { type ImageProps as Props, getImageProps } from 'next/image';
export const props: Props = getImageProps({ src: '/a.jpg' }).props;
export const C = () => <NextImage src="/a.jpg" alt="A" />;
`,
      output: `
import { type ImageProps as Props, getImageProps } from 'next/image';
import NextImage from 'src/components/image/ImageOptimized';
export const props: Props = getImageProps({ src: '/a.jpg' }).props;
export const C = () => <NextImage src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // The named form of the default export splits the same way.
    {
      code: `
import { default as Picture, ImageProps } from 'next/image';
export const C = (opts: ImageProps) => <Picture {...opts} />;
`,
      output: `
import { ImageProps } from 'next/image';
import Picture from 'src/components/image/ImageOptimized';
export const C = (opts: ImageProps) => <Picture {...opts} />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // A namespace alongside the default keeps the namespace on next/image.
    {
      code: `
import Image, * as NextImage from 'next/image';
export const props = NextImage.getImageProps({ src: '/a.jpg' });
export const C = () => <Image src="/a.jpg" alt="A" />;
`,
      output: `
import * as NextImage from 'next/image';
import Image from 'src/components/image/ImageOptimized';
export const props = NextImage.getImageProps({ src: '/a.jpg' });
export const C = () => <Image src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // A type-only sibling of the value default is still a next/image type, so
    // it stays pointed at next/image.
    {
      code: `
import Image, { type ImageProps } from 'next/image';
export const C = (opts: ImageProps) => <Image {...opts} />;
`,
      output: `
import { type ImageProps } from 'next/image';
import Image from 'src/components/image/ImageOptimized';
export const C = (opts: ImageProps) => <Image {...opts} />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // A configured componentPath backs the renamed-default fix too.
    {
      code: `
import Img from 'next/image';
export const C = () => <Img src="/a.jpg" alt="A" />;
`,
      options: [{ componentPath: 'src/components/media/OptimizedPicture' }],
      errors: [
        {
          messageId: 'useImageOptimized',
          data: {
            componentPath: 'src/components/media/OptimizedPicture',
            component: 'next/image',
          },
        },
      ],
      output: `
import Img from 'src/components/media/OptimizedPicture';
export const C = () => <Img src="/a.jpg" alt="A" />;
`,
    },
    // The default binding is the component, so it is the specifier that moves;
    // a redundant named Image alongside it is resolved by the next pass.
    {
      code: `
import Image, { Image as NextImage } from 'next/image';
export const C = () => <div><Image src="/a.jpg" alt="A" /><NextImage src="/b.jpg" alt="B" /></div>;
`,
      output: `
import { Image as NextImage } from 'next/image';
import Image from 'src/components/image/ImageOptimized';
export const C = () => <div><Image src="/a.jpg" alt="A" /><NextImage src="/b.jpg" alt="B" /></div>;
`,
      errors: [{ messageId: 'useImageOptimized' }],
    },
    // A double-quoted source survives the split verbatim.
    {
      code: `
import Img, { ImageProps } from "next/image";
export const C = (opts: ImageProps) => <Img {...opts} />;
`,
      output: `
import { ImageProps } from "next/image";
import Img from 'src/components/image/ImageOptimized';
export const C = (opts: ImageProps) => <Img {...opts} />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
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
    // The declaration exemption matches the component name exactly too, so a
    // distinct component sharing its prefix is still a consumer of it.
    {
      code: `
${IMPORT}
const ImageOptimizedGallery = () => <img src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
const ImageOptimizedGallery = () => <ImageOptimized src="/a.jpg" alt="A" />;
`,
    },
    {
      code: `
${IMPORT}
function ImageOptimizedGallery() {
  return <img src="/a.jpg" alt="A" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
function ImageOptimizedGallery() {
  return <ImageOptimized src="/a.jpg" alt="A" />;
}
`,
    },
    // An export alias that is not the component's name leaves the declaration
    // an ordinary consumer.
    {
      code: `
${IMPORT}
const Gallery = () => <img src="/a.jpg" alt="A" />;
export { Gallery as PhotoGallery };
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
const Gallery = () => <ImageOptimized src="/a.jpg" alt="A" />;
export { Gallery as PhotoGallery };
`,
    },
    // A helper nested inside an ordinary component is reported like any other.
    {
      code: `
${IMPORT}
export const Gallery = (props) => {
  const Raw = () => <img {...props} />;
  return <Raw />;
};
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
${IMPORT}
export const Gallery = (props) => {
  const Raw = () => <ImageOptimized {...props} />;
  return <Raw />;
};
`,
    },
    // A sibling declaration of the component name does not enclose the report,
    // so the element outside it stays a violation.
    {
      code: `
const ImageOptimized = (props) => <picture {...props} />;
export const Gallery = () => <img src="/a.jpg" alt="A" />;
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
const ImageOptimized = (props) => <picture {...props} />;
export const Gallery = () => <ImageOptimized src="/a.jpg" alt="A" />;
`,
    },
    // The declaration name that matters is the configured component's, so an
    // ImageOptimized definition is reportable under a different componentPath
    // only when it is not the module the fix points at.
    {
      code: `
export const Gallery = (props) => <img {...props} />;
`,
      filename: 'src/components/media/Gallery.tsx',
      options: [{ componentPath: 'src/components/media/OptimizedPicture' }],
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
    // A binding inside the reporting function captures the emitted element, so
    // the swap would render that local value instead of the imported wrapper.
    {
      code: `
import ImageOptimized from 'src/components/image/ImageOptimized';
function Component() {
  const ImageOptimized = undefined as unknown as never;
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // The alias is only worth reusing while it still resolves to the import.
    {
      code: `
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
function Component() {
  const CustomImage = undefined as unknown as never;
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // A default import renamed away from the component name is captured the
    // same way, even alongside a correct usage of the import elsewhere.
    {
      code: `
import Image from 'src/components/image/ImageOptimized';
function Component() {
  const Image = undefined as unknown as never;
  return <div><Image src="/a.jpg" alt="A" /><img src="/b.jpg" alt="B" /></div>;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // A parameter shadows the import for the whole function body.
    {
      code: `
${IMPORT}
function Component({ ImageOptimized }) {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // A block-scoped shadow between the import and the report captures it too.
    {
      code: `
${IMPORT}
function Component({ raw }) {
  if (raw) {
    const ImageOptimized = raw;
    return <img src="/example.jpg" alt="Example" />;
  }
  return null;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // The shadow captures the reference wherever it is declared in the scope,
    // including after the JSX it would break.
    {
      code: `
${IMPORT}
function Component() {
  const render = () => <img src="/example.jpg" alt="Example" />;
  const ImageOptimized = render;
  return render;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: null,
    },
    // A same-named binding in a scope that does not enclose the report cannot
    // capture the emitted element, so the fix still applies.
    {
      code: `
import ImageOptimized from 'src/components/image/ImageOptimized';
function Thumbnail() {
  const ImageOptimized = undefined as unknown as never;
  return null;
}
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
import ImageOptimized from 'src/components/image/ImageOptimized';
function Thumbnail() {
  const ImageOptimized = undefined as unknown as never;
  return null;
}
function Component() {
  return <ImageOptimized src="/example.jpg" alt="Example" />;
}
`,
    },
    // Likewise for an alias: a sibling binding of it never reaches the report.
    {
      code: `
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
function Thumbnail() {
  const CustomImage = undefined as unknown as never;
  return null;
}
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
function Thumbnail() {
  const CustomImage = undefined as unknown as never;
  return null;
}
function Component() {
  return <CustomImage src="/example.jpg" alt="Example" />;
}
`,
    },
    // A module-scope binding of the name is the file's component, not a shadow,
    // so reusing it keeps the fix bound to something renderable.
    {
      code: `
const ImageOptimized = dynamic(() => import('src/components/image/ImageOptimized'));
function Component() {
  return <img src="/example.jpg" alt="Example" />;
}
`,
      errors: [{ messageId: 'useImageOptimized' }],
      output: `
const ImageOptimized = dynamic(() => import('src/components/image/ImageOptimized'));
function Component() {
  return <ImageOptimized src="/example.jpg" alt="Example" />;
}
`,
    },
  ],
});
