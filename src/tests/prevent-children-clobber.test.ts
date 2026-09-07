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
    // #2191 subject: a camelCase factory returns a FUNCTION, not JSX, so it is
    // not component-like and its rest binding is not this rule's business. The
    // concise spelling used to pass the gate because the handed body WAS the
    // inner arrow, which returnsJSX unwraps.
    {
      code: `
        const buildDialog = ({ title, ...props }: DialogProps) => () => (
          <Dialog {...props}>
            <AlertStandard message={title} />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
    },
    // #2191 control: the block-bodied twin, which the gate has always rejected.
    {
      code: `
        const buildDialog = ({ title, ...props }: DialogProps) => {
          return () => (
            <Dialog {...props}>
              <AlertStandard message={title} />
            </Dialog>
          );
        };
      `,
      filename: 'component.tsx',
    },
    // #2263 over-decline control: a type parameter binds `KEYS` in TYPE space
    // only, so `typeof KEYS` still reads the outer const in VALUE space. The
    // keep-list stays decidable and excludes children, so declining to trust a
    // shadowed keep-list must not spread to this one. Adding 'children' to the
    // const flips this case to a report, which is what keeps it load-bearing
    {
      code: `
        const KEYS = ['sx'] as const;
        function makeWrapper<KEYS>() {
          type Props = Pick<DialogProps, (typeof KEYS)[number]>;
          const Wrapper = (props: Props) => (
            <Dialog {...props}>
              <Content />
            </Dialog>
          );
          return Wrapper;
        }
      `,
      filename: 'component.tsx',
    },
    {
      /** A parameterized alias is as resolvable as a bare one. */
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'> & { row: T };
        type TestMenuProps<T> = Readonly<SectionProps<T>>;
        const TestMenu = <T,>({ row, ...props }: TestMenuProps<T>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    {
      /** Reduction: the type argument is not used in the alias body at all. */
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'>;
        const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: a bare `Omit` body under an alias taking SEVERAL parameters. The
    // arity of the alias is irrelevant to what its body proves.
    {
      code: `
        type SectionProps<A, B> = Omit<MenuProps, 'children'>;
        const TestMenu = (props: SectionProps<string, number>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: the body is an INTERSECTION whose `Omit` arm carries the proof and
    // whose closed literal arm adds no members that could reopen it.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'> & { row: T };
        const TestMenu = <T,>({ row, ...props }: SectionProps<T>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: a parameterized alias chain two links deep.
    {
      code: `
        type A<T> = B<T>;
        type B<T> = Omit<MenuProps, 'children'>;
        const TestMenu = (props: A<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: three links deep, so resolution is genuinely transitive rather
    // than a single extra hop.
    {
      code: `
        type A<T> = B<T>;
        type B<T> = C<T>;
        type C<T> = Omit<MenuProps, 'children'>;
        const TestMenu = (props: A<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: a self-referential generic alias whose outermost `Omit` decides
    // the question before the recursion matters. Termination is the assertion;
    // a resolver that re-entered `Loop` unguarded would never return.
    {
      code: `
        type Loop<T> = Omit<Loop<T>, 'children'>;
        const TestMenu = (props: Loop<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: a union body excludes the property only when EVERY arm does.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'> | Omit<ListProps, 'children'>;
        const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361 ordering pin: the type ARGUMENTS are inspected before the alias
    // body, and on their own they settle this case. `Frame`'s body is an
    // unbound parameter, which proves nothing, so the exemption can only have
    // come from the argument arm.
    {
      code: `
        type Frame<T> = Readonly<T>;
        const TestMenu = (props: Frame<Omit<MenuProps, 'children'>>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361 ordering pin, undeclared wrapper: nothing to resolve, so only the
    // argument arm can carry this one.
    {
      code: `
        type SectionProps<T> = T;
        const TestMenu = (props: SectionProps<Omit<MenuProps, 'children'>>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: an alias declared inside a function body resolves through a
    // parameterized reference exactly as a top-level one does.
    {
      code: `
        function makeMenu() {
          type SectionProps<T> = Omit<MenuProps, 'children'>;
          const TestMenu = (props: SectionProps<string>) => (
            <Menu {...props}>
              <MenuItem>Replace</MenuItem>
            </Menu>
          );
          return TestMenu;
        }
      `,
      filename: 'component.tsx',
    },
    // #2361: the alias hides inside an `ExportNamedDeclaration`, which the
    // resolver looks through.
    {
      code: `
        export type SectionProps<T> = Omit<MenuProps, 'children'>;
        export const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: the props type of a `forwardRef` is its SECOND type argument, and
    // a parameterized alias there resolves like any other props annotation.
    {
      code: `
        type SaveProps<T> = Omit<ButtonProps, 'children'> & { row: T };
        const Save = forwardRef<HTMLDivElement, SaveProps<string>>((props, ref) => (
          <Button {...props} ref={ref}>
            <Label />
          </Button>
        ));
      `,
      filename: 'component.tsx',
    },
    // #2361: the keep-list arm survives the extra hop too. A `Pick` proof needs
    // the props position, so this also pins that `closedLiteralCounts` is
    // carried into the alias body rather than reset by the detour.
    {
      code: `
        type SaveProps<T> = Pick<ButtonProps, 'sx'>;
        const Save = (props: SaveProps<string>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: a property-preserving wrapper around that keep-list, which only
    // holds while the props position is preserved through both hops.
    {
      code: `
        type SaveProps<T> = Partial<Pick<ButtonProps, 'sx'>>;
        const Save = (props: SaveProps<string>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361: a keep-list spelled as `(typeof KEYS)[number]` stays decidable
    // through a parameterized alias, so the shape `prefer-union-from-const-array`
    // rewrites into is exempt in both spellings.
    {
      code: `
        const KEYS = ['sx'] as const;
        type SaveProps<T> = Pick<ButtonProps, (typeof KEYS)[number]>;
        const Save = (props: SaveProps<string>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
    },
    // #2361 shadowing (#2263 direction): the INNER alias is the one resolved,
    // so a children-free inner declaration exempts the spread even though the
    // outer alias of the same name carries children.
    {
      code: `
        type SectionProps<T> = { children: T };
        function makeMenu() {
          type SectionProps<T> = Omit<MenuProps, 'children'>;
          const TestMenu = (props: SectionProps<string>) => (
            <Menu {...props}>
              <MenuItem>Replace</MenuItem>
            </Menu>
          );
          return TestMenu;
        }
      `,
      filename: 'component.tsx',
    },
    // #2361 boundary: the alias resolver reads type ALIASES only, so a
    // parameterized `interface` is not exempt by this path. It stays silent
    // because an interface denotes a real object type the checker can inspect
    // even when its heritage clause is unresolvable, which the alias arm of a
    // parameterized reference must not be credited for.
    {
      code: `
        interface SectionProps<T> extends Omit<MenuProps, 'children'> {
          row: T;
        }
        const TestMenu = <T,>({ row, ...props }: SectionProps<T>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
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
    // #2191 positive control: the SAME factory shape under a component name
    // still reports, so tightening the returnsJSX gate did not make the rule
    // blind to a spread that really does discard children.
    {
      code: `
        const BuildDialog = ({ title, ...props }: DialogProps) => () => (
          <Dialog {...props}>
            <AlertStandard message={title} />
          </Dialog>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2263 subject: a parameter holds no statement, so a resolver that walks
    // enclosing statement containers steps past it to the outer const. Inside
    // useProcessor `KEYS` denotes the `string` parameter, which leaves the Pick
    // keep-list undecidable — undecidable is not proof that children is
    // excluded, so the spread still clobbers the passed children
    {
      code: `
        const KEYS = ['sx'] as const;
        function useProcessor(KEYS: string) {
          type Props = Pick<DialogProps, (typeof KEYS)[number]>;
          const Wrapper = (props: Props) => (
            <Dialog {...props}>
              <Content />
            </Dialog>
          );
          return Wrapper;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    {
      /** Negative control: a parameterized alias that really does carry children. */
      code: `
        type SaveProps<T> = { children: T };
        const Save = (props: SaveProps<ReactNode>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: the alias body carries `children` through an intersection arm, so
    // resolving it must REACH that arm rather than stop at the `Omit`.
    {
      code: `
        type SaveProps<T> = Omit<ButtonProps, 'sx'> & { children: T };
        const Save = (props: SaveProps<ReactNode>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: one union arm carrying `children` is enough to lose the proof.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'> | { children: T };
        const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 anti-over-broad control: an undeclared generic wrapper written
    // straight into the annotation has no body to resolve, so falling through
    // to the alias arm finds nothing and the report stands.
    {
      code: `
        const Save = (props: Envelope<{ sx?: SxProps }>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: the same undeclared wrapper reached through an alias body stays
    // opaque one hop in.
    {
      code: `
        type SaveProps<T> = Envelope<T>;
        const Save = (props: SaveProps<{ sx?: SxProps }>) => (
          <Button {...props}>
            <Label />
          </Button>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: an alias that omits a DIFFERENT key proves nothing about
    // `children`, so the extra resolution hop must not manufacture a proof.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'open'>;
        const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: an index signature reopens the intersection, exactly as it does
    // for the unparameterized spelling.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'> & {
          [key: string]: unknown;
        };
        const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: an unbound parameter is not substituted, and an argument that is
    // itself unresolvable proves nothing either.
    {
      code: `
        type SectionProps<T> = T;
        const TestMenu = (props: SectionProps<MenuProps>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: an undecidable keep-list stays undecidable behind a parameterized
    // alias.
    {
      code: `
        function makeSave<K extends keyof ButtonProps>() {
          type SaveProps<T> = Pick<ButtonProps, K>;
          const Save = (props: SaveProps<string>) => (
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
    // #2361 termination: a self-referential generic alias proves nothing and
    // must return rather than recurse forever.
    {
      code: `
        type Loop<T> = Loop<T>;
        const TestMenu = (props: Loop<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 termination: a mutually recursive pair, which a per-name guard
    // applied only to the alias being expanded would not catch.
    {
      code: `
        type A<T> = B<T>;
        type B<T> = A<T>;
        const TestMenu = (props: A<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 termination: a three-way tangle mixing intersection and union, so
    // the guard is exercised on more than one recursion path per alias.
    {
      code: `
        type A<T> = B<T> & C<T>;
        type B<T> = C<T> & A<T>;
        type C<T> = A<T> | B<T>;
        const TestMenu = (props: A<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 termination: a self-reference nested in the alias's own arguments,
    // reached through the argument arm rather than the body arm.
    {
      code: `
        type A<T> = A<A<A<T>>>;
        const TestMenu = (props: A<A<A<string>>>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 out of scope, pinned: a member imported from another module has no
    // body in this file, so it stays opaque and still reports.
    {
      code: `
        import type { SectionProps } from './types';
        const TestMenu = (props: SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 out of scope, pinned: a qualified name carries no local alias to
    // resolve either.
    {
      code: `
        const TestMenu = (props: NS.SectionProps<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 shadowing (#2263 direction): the inner alias carries `children`, so
    // resolution must stop at it rather than reach the children-free outer one.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'>;
        function makeMenu() {
          type SectionProps<T> = { children: T };
          const TestMenu = (props: SectionProps<string>) => (
            <Menu {...props}>
              <MenuItem>Replace</MenuItem>
            </Menu>
          );
          return TestMenu;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361 shadowing (#2263 direction): a type PARAMETER binds the name in
    // type space, so the outer alias body is out of reach and undecidable is
    // not proof.
    {
      code: `
        type SectionProps<T> = Omit<MenuProps, 'children'>;
        function makeMenu<SectionProps>() {
          const TestMenu = (props: SectionProps<string>) => (
            <Menu {...props}>
              <MenuItem>Replace</MenuItem>
            </Menu>
          );
          return TestMenu;
        }
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
    // #2361: a self-reference in an intersection blocks the arm the guard has
    // already entered, and an intersection needs EVERY arm to prove the
    // exclusion, so the conservative answer is a report.
    {
      code: `
        type P<T> = P<T> & Omit<MenuProps, 'children'>;
        const TestMenu = (props: P<string>) => (
          <Menu {...props}>
            <MenuItem>Replace</MenuItem>
          </Menu>
        );
      `,
      filename: 'component.tsx',
      errors: [{ messageId: 'childrenClobbered' }],
    },
  ],
});
