import { ruleTesterJsx } from '../utils/ruleTester';
import { preventChildrenClobber } from '../rules/prevent-children-clobber';

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
