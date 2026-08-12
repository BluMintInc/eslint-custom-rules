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
    {
      code: `
        export type Props = Readonly<Omit<DialogProps, 'children' | 'open'>>;
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
        function Outer() {
          type Props = Omit<DialogProps, 'children'>;
          const Accordion = (props: Props) => (
            <AccordionRoot {...props}>
              <AccordionDetails />
            </AccordionRoot>
          );
          return Accordion;
        }
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const make = () => {
          type Props = Omit<DialogProps, 'children'>;
          const Accordion = (props: Props) => (
            <AccordionRoot {...props}>
              <AccordionDetails />
            </AccordionRoot>
          );
          return Accordion;
        };
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        namespace NS {
          export type Props = Omit<DialogProps, 'children'>;
          export const Accordion = (props: Props) => (
            <AccordionRoot {...props}>
              <AccordionDetails />
            </AccordionRoot>
          );
        }
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        class Registry {
          static {
            type Props = Omit<DialogProps, 'children'>;
            const Accordion = (props: Props) => (
              <AccordionRoot {...props}>
                <AccordionDetails />
              </AccordionRoot>
            );
            Registry.register(Accordion);
          }
        }
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        function pick(kind: string) {
          switch (kind) {
            case 'accordion':
              type Props = Omit<DialogProps, 'children'>;
              const Accordion = (props: Props) => (
                <AccordionRoot {...props}>
                  <AccordionDetails />
                </AccordionRoot>
              );
              return Accordion;
            default:
              return null;
          }
        }
      `,
      filename: 'component.tsx',
    },
    {
      // Type aliases hoist, so a component declared above its props alias must
      // still resolve it.
      code: `
        const Accordion = (props: Props) => (
          <AccordionRoot {...props}>
            <AccordionDetails />
          </AccordionRoot>
        );
        export type Props = Readonly<Omit<DialogProps, 'children' | 'open'>>;
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        export type Base = Omit<DialogProps, 'children'>;
        export type Props = Base;
        const Accordion = (props: Props) => (
          <AccordionRoot {...props}>
            <AccordionDetails />
          </AccordionRoot>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // An inner alias shadows a same-named outer one, so the omitting inner
      // declaration is what the component's props resolve to.
      code: `
        type Props = Readonly<DialogProps>;
        function Outer() {
          type Props = Omit<DialogProps, 'children'>;
          const Accordion = (props: Props) => (
            <AccordionRoot {...props}>
              <AccordionDetails />
            </AccordionRoot>
          );
          return Accordion;
        }
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        export type Props = Omit<DialogProps, 'children'>;
        const Wrapper = (props: DialogProps) => {
          const narrowed: Props = props;
          return (
            <Dialog {...narrowed}>
              <Content />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
    },
    {
      // The spelling `prefer-union-from-const-array` rewrites a literal-union
      // alias into. A keep-list that reads decidable before that transform has
      // to stay decidable after it, or applying the recommended config's own
      // `--fix` would manufacture this false positive back.
      code: `
        const CARD_KEYS_VALUES = ['sx', 'elevation'] as const;
        type CardKeys = (typeof CARD_KEYS_VALUES)[number];
        type CardProps = Pick<PaperProps, CardKeys>;
        const Card = (props: CardProps) => (
          <Paper {...props}>
            <CardBody />
          </Paper>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // The composition `require-props-composition` documents as the correct
      // way to narrow a button: a keep-list props type handed to `forwardRef`
      // as a type argument. Neither half was legible, so the rule reported on
      // the shape its sibling rule prescribes (#1980).
      code: `
        export type WithdrawButtonProps = Readonly<
          Pick<LoadingButtonProps, 'sx' | 'size'>
        >;
        const WithdrawButton = forwardRef<HTMLButtonElement, WithdrawButtonProps>(
          (props, ref) => (
            <LoadingButton {...props} ref={ref} color="secondary">
              Withdraw
            </LoadingButton>
          ),
        );
      `,
      filename: 'component.tsx',
    },
    {
      // A keep-list is a stronger guarantee than an omit-list: `Pick` drops
      // every member it does not name.
      code: `
        type CardProps = Pick<PaperProps, 'sx' | 'elevation'>;
        const Card = (props: CardProps) => (
          <Paper {...props}>
            <CardBody />
          </Paper>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // A single literal key is a keep-list too, not just a union of them.
      code: `
        type CardProps = Pick<PaperProps, 'sx'>;
        const Card = (props: CardProps) => (
          <Paper {...props}>
            <CardBody />
          </Paper>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        const Card = (props: Pick<PaperProps, 'sx' | 'elevation'>) => (
          <Paper {...props}>
            <CardBody />
          </Paper>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // A keep-list spelled through an alias is as decidable as an inline one.
      // A multi-key list is spelled as the const array below, since
      // `prefer-union-from-const-array` owns the literal-union alias shape.
      code: `
        type CardKey = 'sx';
        type CardProps = Pick<PaperProps, CardKey>;
        const Card = (props: CardProps) => (
          <Paper {...props}>
            <CardBody />
          </Paper>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // The documented `Omit` remedy already applied, intersected with the
      // component's own closed literal — a live false positive in agora's
      // `withMenu.test.tsx` until #1980.
      code: `
        type TestMenuProps = Readonly<
          Omit<MenuProps, 'children'> & { onClose: () => void }
        >;
        const TestMenu = (props: TestMenuProps) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // A closed object type declares its whole surface, so one without a
      // `children` member provably cannot carry one.
      code: `
        type BadgeProps = { label: string; sx?: SxProps };
        const Badge = (props: BadgeProps) => (
          <Chip {...props}>
            <Dot />
          </Chip>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type BadgeProps = { onSave(): void; 'data-testid'?: string };
        const Badge = (props: BadgeProps) => (
          <Chip {...props}>
            <Dot />
          </Chip>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type BadgeProps = {};
        const Badge = (props: BadgeProps) => (
          <Chip {...props}>
            <Dot />
          </Chip>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type BadgeProps = { sx?: SxProps } & { label: string };
        const Badge = (props: BadgeProps) => (
          <Chip {...props}>
            <Dot />
          </Chip>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // Every arm of the union excludes children, so the union does too.
      code: `
        type SaveProps = Pick<ButtonProps, 'sx'> | { label: string };
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
    },
    {
      // The gap-3 isolation case: the same `Omit` the rule's own message
      // prescribes, unreachable in the `forwardRef` spelling because the
      // parameters carry no annotation of their own.
      code: `
        type WithdrawProps = Readonly<Omit<LoadingButtonProps, 'children'>>;
        const Withdraw = forwardRef<HTMLButtonElement, WithdrawProps>(
          (props, ref) => (
            <LoadingButton {...props} ref={ref}>
              Withdraw
            </LoadingButton>
          ),
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type SaveProps = Pick<ButtonProps, 'sx' | 'size'>;
        const Save = React.forwardRef<HTMLButtonElement, SaveProps>(
          (props, ref) => (
            <Button {...props} ref={ref}>
              Save
            </Button>
          ),
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type SaveProps = Pick<ButtonProps, 'sx'>;
        const Save = memo(
          forwardRef<HTMLButtonElement, SaveProps>((props, ref) => (
            <Button {...props} ref={ref}>
              Save
            </Button>
          )),
        );
      `,
      filename: 'component.tsx',
    },
    {
      // A destructured rest inside a `forwardRef` callback inherits the type
      // argument the same way a plain parameter does.
      code: `
        type SaveProps = Readonly<Omit<ButtonProps, 'children'>>;
        const Save = forwardRef<HTMLButtonElement, SaveProps>(
          ({ sx, ...rest }, ref) => (
            <Button sx={sx} {...rest} ref={ref}>
              Save
            </Button>
          ),
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type SaveProps = Pick<ButtonProps, 'sx'>;
        const Save = forwardRef<HTMLButtonElement, SaveProps>(
          (props = {}, ref) => (
            <Button {...props} ref={ref}>
              Save
            </Button>
          ),
        );
      `,
      filename: 'component.tsx',
    },
    {
      // `Partial` and `Required` re-map members without contributing any, so
      // the proof about the argument still describes the props type.
      code: `
        type SaveProps = Partial<Pick<ButtonProps, 'sx'>>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
    },
    {
      code: `
        type SaveProps = Required<{ sx?: SxProps }>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
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
    {
      // Resolving through `export` must not blanket-exempt exported aliases:
      // one that keeps `children` still clobbers.
      code: `
        export type Props = Readonly<DialogProps>;
        const Accordion = (props: Props) => (
          <AccordionRoot {...props}>
            <AccordionDetails />
          </AccordionRoot>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        function Outer() {
          type Props = Readonly<DialogProps>;
          const Accordion = (props: Props) => (
            <AccordionRoot {...props}>
              <AccordionDetails />
            </AccordionRoot>
          );
          return Accordion;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // The inner alias shadows the omitting outer one, so the exemption must
      // not leak across the scope boundary.
      code: `
        type Props = Omit<DialogProps, 'children'>;
        function Outer() {
          type Props = Readonly<DialogProps>;
          const Accordion = (props: Props) => (
            <AccordionRoot {...props}>
              <AccordionDetails />
            </AccordionRoot>
          );
          return Accordion;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A self-referential alias must terminate rather than recurse forever,
      // and an unprovable exclusion still reports.
      code: `
        export type Props = Props;
        const Accordion = (props: Props) => (
          <AccordionRoot {...props}>
            <AccordionDetails />
          </AccordionRoot>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A sibling scope's alias is not in scope, so the name stays unresolved.
      code: `
        function Sibling() {
          type Props = Omit<DialogProps, 'children'>;
          return null;
        }
        const Accordion = (props: Props) => (
          <AccordionRoot {...props}>
            <AccordionDetails />
          </AccordionRoot>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A keep-list that names `children` keeps it.
      code: `
        type SaveProps = Pick<ButtonProps, 'children' | 'sx'>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A keep-list built from a type parameter names an unknown set of keys,
      // and `children` may be one of them.
      code: `
        function makeSave<K extends keyof ButtonProps>() {
          const Save = (props: Pick<ButtonProps, K>) => (
            <Button {...props}>
              <Label />
            </Button>
          );
          return Save;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type SaveProps = Pick<ButtonProps, keyof ButtonProps>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // One undecidable member poisons the whole keep-list; the decidable
      // sibling key proves nothing on its own.
      code: `
        function makeSave<K extends keyof ButtonProps>() {
          const Save = (props: Pick<ButtonProps, 'sx' | K>) => (
            <Button {...props}>
              <Label />
            </Button>
          );
          return Save;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type SaveProps = Pick<ButtonProps, \`on\${string}\`>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // The wrapper ADDS `children`, so a proof about its argument says
      // nothing about the props type. Contrast the `Required<{ sx?: SxProps }>`
      // valid case above, which is the same shape under a wrapper that
      // contributes no members of its own.
      code: `
        type SaveProps = PropsWithChildren<{ sx?: SxProps }>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // Same hazard for the keep-list arm: `Pick<ButtonProps, 'sx'>` alone is
      // exempt, and wrapping it must not carry that exemption outward.
      code: `
        type SaveProps = PropsWithChildren<Pick<ButtonProps, 'sx'>>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // An index signature over string keys admits `children`, so the mapped
      // type built from one carries it however children-free its argument is.
      code: `
        type SaveProps = Record<string, { a: number }>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // An unknown generic is not a wrapper the rule can reason through.
      code: `
        type SaveProps = Envelope<{ sx?: SxProps }>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // An index signature reopens the literal, so the intersection loses the
      // exemption the `Omit` arm would otherwise carry. Contrast the
      // `{ onClose: () => void }` valid case, which is closed.
      code: `
        type SaveProps = Omit<ButtonProps, 'children'> & {
          [key: string]: unknown;
        };
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // The constant behind a computed key may well be 'children'.
      code: `
        type SaveProps = Omit<ButtonProps, 'children'> & {
          [SLOT_KEY]: ReactNode;
        };
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      code: `
        type SaveProps = { children?: ReactNode; sx?: SxProps };
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A string-literal key names the same member an identifier key does.
      code: `
        type SaveProps = { 'children': ReactNode; sx?: SxProps };
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // One children-carrying arm is enough: the spread may be that arm.
      code: `
        type SaveProps = Pick<ButtonProps, 'sx'> | MenuProps;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // agora's `withMenu.test.tsx:109`, the true-positive sibling of the
      // false positive at `:22`: nothing removes `children` from `MenuProps`.
      code: `
        type SpyMenuProps = Readonly<MenuProps & { onClose: () => void }>;
        const PropsSpyMenu = (props: SpyMenuProps) => (
          <Menu {...props}>
            <MenuItem>Action</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // Reading a `forwardRef` type argument must not fail open: a props type
      // that genuinely carries children still clobbers.
      code: `
        type SpyMenuProps = Readonly<MenuProps>;
        const SpyMenu = forwardRef<HTMLDivElement, SpyMenuProps>(
          (props, ref) => (
            <Menu {...props} ref={ref}>
              <MenuItem>Action</MenuItem>
            </Menu>
          ),
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // The parameter's own annotation is the type its body is checked
      // against, so it wins over the contextual type argument.
      code: `
        type CleanMenuProps = Omit<MenuProps, 'children'>;
        const SpyMenu = forwardRef<HTMLDivElement, CleanMenuProps>(
          (props: MenuProps, ref) => (
            <Menu {...props} ref={ref}>
              <MenuItem>Action</MenuItem>
            </Menu>
          ),
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A const-array keep-list that names `children` keeps it.
      code: `
        const SLOT_KEYS_VALUES = ['children', 'sx'] as const;
        type SlotKeys = (typeof SLOT_KEYS_VALUES)[number];
        type SaveProps = Pick<ButtonProps, SlotKeys>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // A name bound to anything but an `as const` array literal names an
      // unknown set of keys. A bare `['sx']` would be the same defect, but
      // `global-const-style` rewrites it into the decidable spelling, so the
      // assertion could not survive its own config.
      code: `
        const SLOT_KEYS_VALUES = makeSlotKeys();
        type SlotKeys = (typeof SLOT_KEYS_VALUES)[number];
        type SaveProps = Pick<ButtonProps, SlotKeys>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // An element that is not a string literal may itself be 'children'.
      code: `
        const SLOT_KEYS_VALUES = [SLOT, 'sx'] as const;
        type SlotKeys = (typeof SLOT_KEYS_VALUES)[number];
        type SaveProps = Pick<ButtonProps, SlotKeys>;
        const Save = (props: SaveProps) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      // The props type is the SECOND type argument; the first is the element.
      code: `
        type SaveProps = Pick<ButtonProps, 'sx'>;
        const Save = forwardRef<SaveProps, MenuProps>((props, ref) => (
          <Button {...props} ref={ref}>
            <Label />
          </Button>
        ));
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
  ],
});
