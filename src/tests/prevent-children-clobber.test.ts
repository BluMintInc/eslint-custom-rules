import path from 'path';
import { ruleTesterJsx } from '../utils/ruleTester';
import { preventChildrenClobber } from '../rules/prevent-children-clobber';

const tsconfigRootDir = path.join(__dirname, '..', '..');
const typeAwareComponentFile = path.join(
  tsconfigRootDir,
  'src/tests/fixtures/type-aware-component.tsx',
);

ruleTesterJsx.run('prevent-children-clobber', preventChildrenClobber, {
  valid: [
    {
      code: `
        const AlertDialog = ({ title, children, ...props }: DialogProps) => (
          <Dialog {...props}>
            <AlertStandard message={title} />
            {children}
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type Props = Readonly<Omit<DialogProps, 'children' | 'open'>>;
        const Accordion = (props: Props) => (
          <AccordionRoot {...props}>
            <AccordionDetails />
          </AccordionRoot>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = ({ children, ...rest }: Props) => {
          return (
            <Box {...rest}>
              <>
                {children}
              </>
            </Box>
          );
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Icon = ({ color, ...props }: IconProps) => <SvgIcon {...props} />;
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Passthrough = (props: DialogProps) => (
          <Dialog {...props}>{props.children}</Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const PassthroughAliased = (props: DialogProps) => {
          const content = props.children;
          return <Dialog {...props}>{content}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const PassthroughDestructured = (props: DialogProps) => {
          const { children } = props;
          return <Dialog {...props}>{children}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const PassthroughDestructuredRenamed = (props: DialogProps) => {
          const { children: content } = props;
          return <Dialog {...props}>{content}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => {
          const { children = null } = props;
          return <Dialog {...props}>{children}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => {
          const content = props.children;
          const forwarded = content;
          return <Dialog {...props}>{forwarded}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => {
          const alias = props;
          return <Dialog {...alias}>{props.children}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => {
          const { 'children': children, ...rest } = props;
          return <Dialog {...rest}>{children}</Dialog>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => (
          <Dialog {...props}>{props?.children}</Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => (
          <Dialog {...props}>
            <Box>{props.children}</Box>
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: Omit<DialogProps, ['children']>) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Wrapper = (props: Omit<DialogProps, 'children'[]>) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type Props = { open: boolean };
        const Wrapper = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: typeAwareComponentFile,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        type Props = { open: boolean } | { title: string };
        const Wrapper = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: typeAwareComponentFile,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        type Props = { open: boolean } & { title: string };
        const Wrapper = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: typeAwareComponentFile,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        const Wrapper = (props: any) => (
          <Dialog {...props}>
            {props.children}
          </Dialog>
        );
      `,
      filename: typeAwareComponentFile,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        const PassthroughWithFallback = (props: DialogProps) => (
          <Dialog {...props}>{props.children ?? <span />}</Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Safe = (props: Omit<DialogProps, 'children'>) => (
          <Dialog {...props}>
            <AlertStandard />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Forwarded = ({ children, ...dialogProps }: DialogProps) => (
          <Dialog {...dialogProps}>{children}</Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Plain = () => {
          const attrs = { role: 'alert' as const };
          return <div {...attrs}>Inline</div>;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const SelfClosingSpread = ({ ...svgProps }: SvgIconProps) => (
          <SvgIcon {...svgProps} />
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const WithOmitReadonly = (props: Readonly<Omit<DialogProps, 'children'>>) => (
          <Dialog {...props}>
            <AlertStandard />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type Props = Omit<DialogProps, 'children'> | Omit<OtherProps, 'children'>;
        const ValidUnion = (props: Props) => (
          <Dialog {...props}>
            <AlertStandard />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type Props = Omit<DialogProps, 'children'> & Omit<OtherProps, 'children'>;
        const ValidIntersection = (props: Props) => (
          <Dialog {...props}>
            <AlertStandard />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
  ],
  invalid: [
    {
      code: `
        const AlertDialog = ({ title, ...props }: DialogProps) => (
          <Dialog {...props}>
            <AlertStandard message={title} />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const AlertDialog = (props: DialogProps) => (
          <Dialog {...props}>
            <AlertStandard />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = ({ ...props }: DialogProps = {}) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        function Wrapper(props: DialogProps) {
          return (
            <Dialog {...props}>
              <Content />
            </Dialog>
          );
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = memo((props: DialogProps) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        ));
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => {
          const {
            inner: { ...rest },
          } = props;
          return (
            <Dialog {...rest}>
              <Content />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const DEFAULT_PROPS = {} as DialogProps;
        const Wrapper = (props: DialogProps = DEFAULT_PROPS) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = (props: DialogProps) => {
          const children = <Fixed />;
          return <Dialog {...props}>{children}</Dialog>;
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = (propsA: DialogProps, propsB: DialogProps) => (
          <Dialog {...propsA} {...propsB}>
            {propsA.children}
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type Props = { children: string } | { open: boolean };
        const Wrapper = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: typeAwareComponentFile,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = ({ ...rest }: DialogProps) => {
          return (
            <Dialog {...rest}>
              <Content />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = ({ ...rest }: DialogProps) => {
          const dialogProps = rest;
          return (
            <Dialog {...dialogProps}>
              <Content />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type Props = Omit<DialogProps, 'open'>;
        const Wrapper = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = ({ title, ...rest }: DialogProps) => {
          return (
            <Dialog {...rest}>
              {title && <Content />}
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = ({ label, ...dialogProps }: DialogProps) => (
          <Dialog {...dialogProps}>
            <>
              <Header />
              <Content label={label} />
            </>
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const Wrapper = ({ ...props }: DialogProps) => (
          <Dialog data-testid="dialog" {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const WithAlias = ({ ...props }: DialogProps) => {
          const alias = props;
          return (
            <Dialog {...alias}>
              <Content />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const InlineFunction = function (props: DialogProps) {
          return (
            <Dialog {...props}>
              <Content />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        const LowercaseComponent = (props: DialogProps) => (
          <dialog {...props}>
            <Content />
          </dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type Props = Omit<DialogProps, 'children'> | DialogProps;
        const InvalidUnion = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type Props = Omit<DialogProps, 'children'> & DialogProps;
        const InvalidIntersection = (props: Props) => (
          <Dialog {...props}>
            <Content />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
  ],
});
