import fs from 'fs';
import os from 'os';
import path from 'path';
import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { requirePropsComposition } from '../rules/require-props-composition';

const DEFAULT_FILENAME = 'src/components/MyComponent.tsx';
// Issue #1316 (reopened): proving an imported child takes no props requires
// reading the child module off disk, so these cases need a real filename inside
// the fixture directory plus a targetPaths glob that matches it.
const FIXTURE_FILENAME = path.join(
  __dirname,
  'fixtures/require-props-composition/TeamVersusRecord.tsx',
);
const FIXTURE_TARGET_PATHS = ['**/fixtures/**/*.tsx'];
const FIXTURE_OPTIONS: [{ targetPaths: string[] }] = [
  { targetPaths: FIXTURE_TARGET_PATHS },
];
// Issue #1268: getFilename() is absolute/platform-native in production; the rule
// must resolve these against the repo-relative target globs.
const ABSOLUTE_FILENAME = '/Users/dev/agora/src/components/MyComponent.tsx';
const WINDOWS_FILENAME = 'C:\\repo\\src\\components\\MyComponent.tsx';
const ABSOLUTE_OUT_OF_SCOPE = '/Users/dev/agora/src/util/HelperWidget.tsx';

ruleTesterJsx.run('require-props-composition', requirePropsComposition, {
  valid: [
    // 1. Props uses Omit with child's Props type
    {
      filename: DEFAULT_FILENAME,
      code: `
type UserCardLayoutProps = { id: string; status: string; };
type FriendCardLayoutProps = Omit<UserCardLayoutProps, 'avatarProps'> & {
  mutualFriendsCountEstimate?: number;
};
const FriendCardLayout = ({ id, ...props }: FriendCardLayoutProps) => {
  return <UserCardLayout id={id} {...props} />;
};
`,
    },
    // 2. Props uses Pick with child's Props type
    {
      filename: DEFAULT_FILENAME,
      code: `
type LoadingButtonProps = { sx?: object; size?: string; onClick?: () => void; };
export type WithdrawButtonProps = Readonly<Pick<LoadingButtonProps, 'sx' | 'size'>>;
const WithdrawButton = (props: WithdrawButtonProps) => {
  return <LoadingButton {...props}>Withdraw</LoadingButton>;
};
`,
    },
    // 3. Props uses Omit wrapped in Readonly
    {
      filename: DEFAULT_FILENAME,
      code: `
type ChipProps = { variant?: string; label?: string; };
type ChipTabProps = Readonly<Omit<ChipProps, 'variant'>> & { isActive: boolean; };
const ChipTab = ({ isActive, ...rest }: ChipTabProps) => {
  return <Chip {...rest} />;
};
`,
    },
    // 4. Component rendering only excluded leaf components — no flag
    {
      filename: DEFAULT_FILENAME,
      code: `
type InfoCardProps = { title: string; description: string; };
const InfoCard = ({ title, description }: InfoCardProps) => {
  return (
    <Box>
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2">{description}</Typography>
    </Box>
  );
};
`,
    },
    // 5. Component with no Props type declaration — skip
    {
      filename: DEFAULT_FILENAME,
      code: `
const SimpleButton = ({ label, onClick }) => {
  return <LoadingButton onClick={onClick}>{label}</LoadingButton>;
};
`,
    },
    // 6. File outside targetPaths — should be skipped entirely
    {
      filename: 'src/hooks/useCustomHook.tsx',
      code: `
type MyHookProps = { value: string; };
const MyComponent = ({ value }: MyHookProps) => {
  return <LoadingButton>{value}</LoadingButton>;
};
`,
    },
    // 6b. Issue #1268: an ABSOLUTE path outside the target paths stays exempt
    // after repo-relative resolution (src/util is not src/components).
    {
      filename: ABSOLUTE_OUT_OF_SCOPE,
      code: `
type MyButtonProps = { label: string; disabled?: boolean; };
const MyButton = ({ label, disabled }: MyButtonProps) => {
  return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
};
`,
    },
    // 7. minDependencyCount not met — only renders one dependency, min set to 2
    {
      filename: DEFAULT_FILENAME,
      options: [{ minDependencyCount: 2 }],
      code: `
type ButtonWrapperProps = { label: string; };
const ButtonWrapper = ({ label }: ButtonWrapperProps) => {
  return <LoadingButton>{label}</LoadingButton>;
};
`,
    },
    // 8. requireAllDependencies false: composes with one of several deps
    {
      filename: DEFAULT_FILENAME,
      options: [{ requireAllDependencies: false }],
      code: `
type LoadingButtonProps = { sx?: object; };
type DialogButtonProps = Omit<LoadingButtonProps, 'size'> & { onConfirm: () => void; };
const DialogButton = ({ onConfirm, ...rest }: DialogButtonProps) => {
  return (
    <Dialog>
      <LoadingButton onClick={onConfirm} {...rest} />
    </Dialog>
  );
};
`,
    },
    // 9. Nested composition in property (iconProps?: Omit<GradientIconButtonProps,...>)
    {
      filename: DEFAULT_FILENAME,
      code: `
type GradientIconButtonProps = { IconComponent?: React.FC; sx?: object; };
type CopyButtonProps = {
  value: string;
  iconProps?: Omit<GradientIconButtonProps, 'IconComponent'>;
};
const CopyButton = ({ value, iconProps }: CopyButtonProps) => {
  return <GradientIconButton {...iconProps} />;
};
`,
    },
    // 10. Component name is same as a dep (renders itself — skip self)
    {
      filename: DEFAULT_FILENAME,
      code: `
type LoadingButtonProps = { sx?: object; size?: string; };
type MyButtonProps = Pick<LoadingButtonProps, 'sx'> & { label: string; };
const MyButton = (props: MyButtonProps) => {
  return <LoadingButton {...props} />;
};
`,
    },
    // 11. Component only renders excluded + self — no flag
    {
      filename: DEFAULT_FILENAME,
      code: `
type HeaderProps = { title: string; };
const Header = ({ title }: HeaderProps) => (
  <Stack>
    <Box><Typography>{title}</Typography></Box>
  </Stack>
);
`,
    },
    // 12. forwardRef pattern — function wrapped in forwardRef, composes
    {
      filename: DEFAULT_FILENAME,
      code: `
type LoadingButtonProps = { sx?: object; size?: string; };
export type WithdrawButtonProps = Readonly<Pick<LoadingButtonProps, 'sx' | 'size'>>;
const WithdrawButton = React.forwardRef<HTMLButtonElement, WithdrawButtonProps>(
  (props, ref) => {
    return <LoadingButton {...props} ref={ref}>Withdraw</LoadingButton>;
  }
);
`,
    },
    // 13. Props use intersection of Pick types from two deps (requireAllDeps=true satisfied)
    {
      filename: DEFAULT_FILENAME,
      options: [{ requireAllDependencies: true }],
      code: `
type LoadingButtonProps = { sx?: object; };
type TooltipProps = { title: string; };
type MyButtonProps = Pick<LoadingButtonProps, 'sx'> & Pick<TooltipProps, 'title'>;
const MyButton = ({ sx, title, ...rest }: MyButtonProps) => (
  <Tooltip title={title}><LoadingButton sx={sx} {...rest} /></Tooltip>
);
`,
    },
    // 14. Custom excludeComponents option — Dialog excluded, no flag
    {
      filename: DEFAULT_FILENAME,
      options: [{ excludeComponents: ['Dialog', 'Tooltip'] }],
      code: `
type ConfirmButtonProps = { label: string; };
const ConfirmButton = ({ label }: ConfirmButtonProps) => (
  <Dialog><Tooltip title={label}><span>{label}</span></Tooltip></Dialog>
);
`,
    },
    // 15. Props type defined via Readonly<Pick<...>> without an outer alias also works
    {
      filename: DEFAULT_FILENAME,
      code: `
type LoadingButtonProps = { sx?: object; size?: string; variant?: string; };
export type SaveButtonProps = Readonly<Pick<LoadingButtonProps, 'sx' | 'size'>>;
export const SaveButton = ({ sx, size }: SaveButtonProps) => (
  <LoadingButton sx={sx} size={size}>Save</LoadingButton>
);
`,
    },
    // 16. No JSX at all in the component — nothing to compose
    {
      filename: DEFAULT_FILENAME,
      code: `
type UtilProps = { value: string; };
const UtilComponent = ({ value }: UtilProps) => {
  return null;
};
`,
    },
    // 17. Only lowercase JSX elements (host elements) — no flag
    {
      filename: DEFAULT_FILENAME,
      code: `
type DivWrapperProps = { children: React.ReactNode; };
const DivWrapper = ({ children }: DivWrapperProps) => (
  <div><span>{children}</span></div>
);
`,
    },
    // 18. Fragment (React.Fragment) is excluded — no flag
    {
      filename: DEFAULT_FILENAME,
      code: `
type WrapperProps = { children: React.ReactNode; };
const Wrapper = ({ children }: WrapperProps) => (
  <React.Fragment>{children}</React.Fragment>
);
`,
    },
    // 19. Inverse composition: the child derives its props FROM the parent via
    // Omit<ParentProps, ...> and there is no named ChildProps. The parent is the
    // single shared source of truth, so the rule must NOT require the parent to
    // compose from a non-existent LiveProps. (issue #1289)
    {
      filename: 'src/components/LiveBadge.tsx',
      code: `
import Box from '@mui/material/Box';
import { Fragment } from 'react';

type LiveBadgeProps = {
  children?: JSX.Element;
  size?: string;
};

function LiveUnmemoized({ size }: Omit<LiveBadgeProps, 'children'>) {
  return <Box>{size}</Box>;
}
const Live = LiveUnmemoized;

function LiveBadgeUnmemoized({ children, size }: LiveBadgeProps) {
  return (
    <Fragment>
      {children}
      <Live size={size} />
    </Fragment>
  );
}
export const LiveBadge = LiveBadgeUnmemoized;
`,
    },
    // 20. Inverse composition, real agora shape: child props are
    // Readonly<Omit<ParentProps, ...>> and the child is defined inline as an
    // arrow component. (issue #1289)
    {
      filename: 'src/components/LiveBadge.tsx',
      code: `
type LiveBadgeProps = {
  children?: JSX.Element;
  size?: string;
};

const Live = ({ size }: Readonly<Omit<LiveBadgeProps, 'children'>>) => (
  <span>{size}</span>
);

const LiveBadge = ({ children, size }: LiveBadgeProps) => (
  <div>
    {children}
    <Live size={size} />
  </div>
);
`,
    },
    // 21. Inverse composition through a named LiveProps alias that itself
    // derives from the parent. (issue #1289)
    {
      filename: 'src/components/LiveBadge.tsx',
      code: `
type LiveBadgeProps = {
  children?: JSX.Element;
  size?: string;
};
type LiveProps = Pick<LiveBadgeProps, 'size'>;

const Live = ({ size }: LiveProps) => <span>{size}</span>;

const LiveBadge = ({ children, size }: LiveBadgeProps) => (
  <div>
    {children}
    <Live size={size} />
  </div>
);
`,
    },
    // 22. MUI icon components are decorative leaves — rendering them alongside
    // excluded primitives must NOT demand props composition. (issue #1307)
    {
      filename: 'src/components/IconLabel.tsx',
      code: `
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/CheckRounded';
import LinkIcon from '@mui/icons-material/LinkRounded';

type IconLabelProps = Readonly<{
  label: string;
  active: boolean;
}>;

const IconLabel = ({ label, active }: IconLabelProps) => {
  return (
    <Box>
      {active ? <CheckIcon /> : <LinkIcon />}
      <Typography>{label}</Typography>
    </Box>
  );
};
`,
    },
    // 23. A single icon dependency is not enough to trip the rule. (issue #1307)
    {
      filename: 'src/components/StatusDot.tsx',
      code: `
type StatusDotProps = { active: boolean; };
const StatusDot = ({ active }: StatusDotProps) => {
  return active ? <CheckIcon /> : <CloseIcon />;
};
`,
    },
    // 24. Icons are dropped from the dep set even when composition-eligible
    // non-leaf children are present and DO compose. (issue #1307)
    {
      filename: 'src/components/DecoratedButton.tsx',
      code: `
type LoadingButtonProps = { sx?: object; size?: string; };
type DecoratedButtonProps = Pick<LoadingButtonProps, 'sx'>;
const DecoratedButton = (props: DecoratedButtonProps) => {
  return (
    <LoadingButton {...props}>
      <RefreshIcon />
    </LoadingButton>
  );
};
`,
    },
    // 25. Issue #1316 FP shape 1: a direct intersection with the child's WHOLE
    // props type is the maximal form of composition (the whole surface is
    // inherited verbatim, strictly stronger than Pick/Omit), so it must NOT flag.
    {
      filename: 'src/components/MyComponent.tsx',
      code: `
type ChildPlainProps = { hits: readonly string[]; label: string };
export type ParentCProps = ChildPlainProps & Readonly<{ title: string }>;
const ParentC = ({ title, ...props }: ParentCProps) => {
  return (
    <div>
      {title}
      <ChildPlain {...props} />
    </div>
  );
};
`,
    },
    // 26. Issue #1316 FP shape 1 variant: generic-instantiated child props type
    // (ChildGenericProps<string>) intersected verbatim is still maximal
    // composition — must NOT flag.
    {
      filename: 'src/components/MyComponent.tsx',
      code: `
type ChildGenericProps<T> = { hits: readonly T[]; label: string };
export type ParentBProps = ChildGenericProps<string> & Readonly<{ title: string }>;
const ParentB = ({ title, ...props }: ParentBProps) => {
  return (
    <div>
      {title}
      <ChildGeneric {...props} />
    </div>
  );
};
`,
    },
    // 27. Issue #1316 FP shape 2: a rendered child that takes no props has no
    // customization surface to compose with (same category as a decorative
    // icon), so it must NOT demand a nonexistent ChildNoPropsProps.
    {
      filename: 'src/components/MyComponent.tsx',
      code: `
const ChildNoProps = () => {
  return <div />;
};
export type ParentAProps = Readonly<{ title: string }>;
const ParentA = ({ title }: ParentAProps) => {
  return (
    <div>
      {title}
      <ChildNoProps />
    </div>
  );
};
`,
    },
    // 28. Issue #1316 FP shape 1: a bare direct reference to the child's whole
    // props type (no intersection at all) is maximal composition — no flag.
    {
      filename: DEFAULT_FILENAME,
      code: `
type ChildPlainProps = { hits: readonly string[]; label: string };
export type ParentProps = ChildPlainProps;
const Parent = (props: ParentProps) => {
  return <ChildPlain {...props} />;
};
`,
    },
    // 29. Issue #1316 FP shape 1: Readonly<ChildPlainProps> directly wraps the
    // whole child props type — recursion into the Readonly param hits the
    // direct-name check, so it composes — no flag.
    {
      filename: DEFAULT_FILENAME,
      code: `
type ChildPlainProps = { hits: readonly string[]; label: string };
export type ParentProps = Readonly<ChildPlainProps>;
const Parent = (props: ParentProps) => {
  return <ChildPlain {...props} />;
};
`,
    },
    // 30. Issue #1316 FP shape 2: zero-prop child declared as a FunctionDeclaration
    // (not an arrow) is still filtered out — no flag.
    {
      filename: DEFAULT_FILENAME,
      code: `
function ChildNoProps() {
  return <div />;
}
export type ParentAProps = Readonly<{ title: string }>;
const ParentA = ({ title }: ParentAProps) => {
  return (
    <div>
      {title}
      <ChildNoProps />
    </div>
  );
};
`,
    },
    // 31. Issue #1316 FP shape 2: a zero-prop child rendered alongside a genuine
    // composing child stays valid even under requireAllDependencies:true — the
    // zero-prop child is dropped from the dep set, so only the composing child
    // is checked.
    {
      filename: DEFAULT_FILENAME,
      options: [{ requireAllDependencies: true }],
      code: `
type LoadingButtonProps = { sx?: object; };
type ParentProps = Pick<LoadingButtonProps, 'sx'>;
const ZeroChild = () => <div />;
const Parent = (props: ParentProps) => (
  <div>
    <LoadingButton {...props} />
    <ZeroChild />
  </div>
);
`,
    },
    // 32. Issue #1343: discriminated-union Props whose BOTH arms compose via a
    // Pick<>-based shared base (RowBaseProps). Composition is present on every
    // arm, so the rule must not fire — the walker must resolve the named arm
    // aliases through the union to reach their shared Pick<MenuItemProps>.
    {
      filename: 'src/components/UnionRow.tsx',
      code: `
import MenuItem, { MenuItemProps } from '@mui/material/MenuItem';

type RowBaseProps = Pick<MenuItemProps, 'tabIndex'> & { label: string };
type RowActionableProps = RowBaseProps & { disabled?: false; onClick?: () => void };
type RowInertProps = RowBaseProps & { disabled: true };

export type UnionRowProps = Readonly<RowActionableProps | RowInertProps>;

export const UnionRow = (props: UnionRowProps) => {
  return (
    <MenuItem tabIndex={props.tabIndex} disabled={props.disabled}>
      {props.label}
    </MenuItem>
  );
};
`,
    },
    // 33. Issue #1343: inline union (no named arms) composing directly via
    // Pick<> on each arm. Guards the arm-recursion fix against the
    // no-shared-base shape too.
    {
      filename: 'src/components/InlineUnionRow.tsx',
      code: `
import MenuItem, { MenuItemProps } from '@mui/material/MenuItem';

export type InlineUnionRowProps = Readonly<
  | (Pick<MenuItemProps, 'tabIndex'> & { disabled: true; label: string })
  | (Pick<MenuItemProps, 'tabIndex'> & { disabled?: false; onClick?: () => void; label: string })
>;

export const InlineUnionRow = (props: InlineUnionRowProps) => {
  return <MenuItem tabIndex={props.tabIndex}>{props.label}</MenuItem>;
};
`,
    },
    // 34. Issue #1343: heterogeneous discriminated union whose arms render
    // DIFFERENT children — each arm composes with the child rendered in its own
    // branch (Switch arm composes SwitchProps, Checkbox arm composes
    // CheckboxProps). Union composition is `.some` (any arm composes), not
    // `.every`; requiring every arm to compose with every child would falsely
    // flag this legitimate pattern. Must stay valid.
    {
      filename: 'src/components/EditableBoolean.tsx',
      code: `
import Switch, { SwitchProps } from '@mui/material/Switch';
import Checkbox, { CheckboxProps } from '@mui/material/Checkbox';

type SwitchArmProps = Omit<SwitchProps, 'checked'> & { variant: 'switch'; value: boolean };
type CheckboxArmProps = Omit<CheckboxProps, 'checked'> & { variant: 'checkbox'; value: boolean };

export type EditableBooleanProps = Readonly<SwitchArmProps | CheckboxArmProps>;

export const EditableBoolean = (props: EditableBooleanProps) => {
  return props.variant === 'switch' ? (
    <Switch checked={props.value} />
  ) : (
    <Checkbox checked={props.value} />
  );
};
`,
    },
    // 35. Issue #1316 (reopened): the real agora shape — the zero-prop child is
    // IMPORTED from a sibling module rather than declared in-file, so in-file
    // resolution cannot see it. Reading BestOfText.tsx proves it takes no props,
    // so it is not a composition dependency and no BestOfTextProps is demanded.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { BestOfText } from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecordUnmemoized = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
`,
    },
    // 36. Issue #1316 (reopened): an aliased named import resolves through the
    // LOCAL name in JSX to the IMPORTED name in the target module.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { BestOfText as Best } from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <Best />
  </div>
);
`,
    },
    // 37. Issue #1316 (reopened): memo() preserves the wrapped component's props
    // surface, so a memo-wrapped zero-param child is still prop-less.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { MemoChild } from './MemoChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <MemoChild />
  </div>
);
`,
    },
    // 38. Issue #1316 (reopened): default import, where the default export is an
    // alias of a locally declared zero-param arrow component.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultChild from './DefaultChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <DefaultChild />
  </div>
);
`,
    },
    // 39. Issue #1316 (reopened): directory-form import resolves through
    // <source>/index.tsx, where the binding is exported via an `export { … }`
    // clause rather than an inline `export const`.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { IndexChild } from './IndexChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <IndexChild />
  </div>
);
`,
    },
    // 40. Issue #1316 (reopened): under requireAllDependencies the prop-less
    // import is dropped from the dep set, so the remaining composing child is
    // enough to satisfy the rule.
    {
      filename: FIXTURE_FILENAME,
      options: [
        { targetPaths: FIXTURE_TARGET_PATHS, requireAllDependencies: true },
      ],
      code: `
import { BestOfText } from './BestOfText';

type LoadingButtonProps = { sx?: object; };
export type TeamVersusRecordProps = Pick<LoadingButtonProps, 'sx'>;

const TeamVersusRecord = (props: TeamVersusRecordProps) => (
  <div>
    <LoadingButton {...props} />
    <BestOfText />
  </div>
);
`,
    },
    // 41. Issue #1316 (reopened), defect D4: ApostropheChild.tsx really is
    // prop-less, but its body holds an apostrophe in JSX text and a regex
    // literal containing a quote. Reading the child module as text mistakes
    // those for an unterminated string and loses the proof; parsing it does not,
    // so the child is still dropped from the dependency set.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ApostropheChild } from './ApostropheChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <ApostropheChild />
  </div>
);
`,
    },
    // 42. Issue #1316 (reopened): forwardRef is props-preserving, so a
    // forwardRef-wrapped zero-parameter child is still prop-less. The HOC
    // allowlist that closes the lazy()/dynamic() hole must keep this working.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ForwardRefChild } from './MemoChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <ForwardRefChild />
  </div>
);
`,
    },
    // 43. Issue #1316 (reopened): the React.-qualified callee form of a
    // props-preserving HOC resolves the same way as the bare one.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ReactMemoChild } from './MemoChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <ReactMemoChild />
  </div>
);
`,
    },
    // 44. Issue #1316 (reopened): React.forwardRef, the other qualified form.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ReactForwardRefChild } from './MemoChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <ReactForwardRefChild />
  </div>
);
`,
    },
    // 45. Issue #1316 (reopened): mobx's observer() is props-preserving too.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ObserverChild } from './MemoChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <ObserverChild />
  </div>
);
`,
    },
    // 46. Issue #1316 (reopened): an ANONYMOUS default-exported function
    // declaration IS the component — there is no alias or wrapper call to follow
    // — so its empty parameter list proves the child prop-less.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import AnonDefaultChild from './AnonDefaultChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <AnonDefaultChild />
  </div>
);
`,
    },
    // 47. Issue #1316 (reopened): `export default memo(Inner)` — the IDENTIFIER
    // argument of a props-preserving HOC is followed to its declaration in the
    // child's own module, where it takes no parameters.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultMemoAliasChild from './DefaultMemoAliasChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <DefaultMemoAliasChild />
  </div>
);
`,
    },
    // 48. Issue #1316 (reopened): `export default memo(() => …)` — the wrapped
    // function is written INLINE, so the zero-parameter arrow is read straight
    // out of the default export's argument list.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultMemoInlineChild from './DefaultMemoInlineChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <DefaultMemoInlineChild />
  </div>
);
`,
    },
    // 49. Issue #1316 (reopened), defect 2: a constructor parameter property
    // declares a class MEMBER, not a binding in the component's scope, so it
    // does not shadow the import and the prop-less proof still stands.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  class KidRegistry {
    constructor(public PropLessKid: string) {}
  }
  const registry = new KidRegistry(title);
  return (
    <div>
      {registry.PropLessKid}
      <PropLessKid />
    </div>
  );
};
`,
    },
    // 50. A rest parameter carries no props type annotation, so the component
    // has no resolvable props type at all and the rule skips it rather than
    // demanding composition against a type it cannot name.
    {
      filename: DEFAULT_FILENAME,
      code: `
const MetricsList = (...args: readonly string[]) => {
  return <LoadingButton>{args.length}</LoadingButton>;
};
`,
    },
    // 51. The component's props type is IMPORTED, so its definition is not in
    // this file and no composition can be proven in either direction — the rule
    // skips rather than guessing.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ExternalPanelProps } from '@acme/design-system';

const Panel = (props: ExternalPanelProps) => {
  return <LoadingButton {...props} />;
};
`,
    },
    // 52. Issue #1374: a generic `ComponentType` prop slot destructured from the
    // props parameter is a caller-injected strategy, not a fixed child. There is
    // no `ViewComponentProps` type anywhere to compose with, and the slot's
    // contract is already declared on the prop itself.
    {
      filename: 'src/components/edit/view-component/RangeView.tsx',
      code: `
import { ComponentType } from 'react';

type ViewComponentPropsBase<T> = {
  value: T | undefined;
  isEditable?: boolean;
  placeholder?: string;
};

export type RangeViewProps = ViewComponentPropsBase<{ min: number; max: number }> & {
  ViewComponent: ComponentType<ViewComponentPropsBase<string>>;
  labelHeader?: string;
};

export const RangeView = ({
  value,
  isEditable,
  labelHeader,
  ViewComponent,
  ...rest
}: RangeViewProps) => {
  const label = value ? labelHeader + ': ' + value.min + ' - ' + value.max : undefined;
  return <ViewComponent {...rest} isEditable={isEditable} value={label} />;
};
`,
    },
    // 53. Issue #1374: the `props.X` spelling of the same slot.
    {
      filename: 'src/components/edit/view-component/SlotView.tsx',
      code: `
import { ComponentType } from 'react';

export type SlotViewProps = {
  Slot: ComponentType<{ value: string }>;
  value: string;
};

export const SlotView = (props: SlotViewProps) => {
  return <props.Slot value={props.value} />;
};
`,
    },
    // 54. Issue #1374: the slot destructured out of `props` in the body rather
    // than in the signature resolves to the same binding.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType } from 'react';

export type SlotViewProps = {
  Slot: ComponentType<{ value: string }>;
  value: string;
};

export const SlotView = (props: SlotViewProps) => {
  const { Slot } = props;
  return <Slot value={props.value} />;
};
`,
    },
    // 55. Issue #1374: a renamed slot binds under the local name, which is what
    // the JSX resolves to.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType } from 'react';

export type SlotViewProps = {
  render: ComponentType<{ value: string }>;
  value: string;
};

export const SlotView = ({ render: Renderer, value }: SlotViewProps) => {
  return <Renderer value={value} />;
};
`,
    },
    // 56. Issue #1374: a slot with a default still resolves to the parameter
    // binding, so the caller can always override it.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType } from 'react';

export type SlotViewProps = {
  Slot?: ComponentType<{ value: string }>;
  value: string;
};

export const SlotView = ({ Slot = DefaultSlot, value }: SlotViewProps) => {
  return <Slot value={value} />;
};
`,
    },
    // 57. Issue #1374: slots nested inside a props sub-object.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType } from 'react';

export type PanelViewProps = {
  slots: { Header: ComponentType<{ title: string }> };
  title: string;
};

export const PanelView = ({ slots: { Header }, title }: PanelViewProps) => {
  return <Header title={title} />;
};
`,
    },
    // 58. Issue #1374: a slot rendered by a `function` declaration component.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType } from 'react';

export type SlotViewProps = {
  Slot: ComponentType<{ value: string }>;
  value: string;
};

export function SlotView({ Slot, value }: SlotViewProps) {
  return <Slot value={value} />;
}
`,
    },
    // 59. Issue #1374: a slot inside a memo() wrapper, the shape the bug was
    // reported against.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType, memo } from 'react';

export type SlotViewProps = {
  Slot: ComponentType<{ value: string }>;
  value: string;
};

export const SlotView = memo(function SlotViewUnmemoized({
  Slot,
  value,
}: SlotViewProps) {
  return <Slot value={value} />;
});
`,
    },
    // 60. Issue #1709: a child whose props are a union — composing with one
    // MEMBER composes with the child's surface, the same way #1343 credits any
    // arm on the parent side.
    {
      filename: 'src/components/MemberComposed.tsx',
      code: `
type ChildSwitchProps = Readonly<{ variant: 'switch'; label: string }>;
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildProps = ChildSwitchProps | ChildChipProps;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type MemberComposedProps = Readonly<Pick<ChildChipProps, 'label'>>;
export const MemberComposed = ({ label }: MemberComposedProps) => (
  <Child label={label} variant="chip" />
);
`,
    },
    // 61. Issue #1709: the union ALIAS itself keeps composing — the negative
    // control that isolates the defect to the member spelling.
    {
      filename: 'src/components/AliasComposed.tsx',
      code: `
type ChildSwitchProps = Readonly<{ variant: 'switch'; label: string }>;
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildProps = ChildSwitchProps | ChildChipProps;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type AliasComposedProps = Readonly<Pick<ChildProps, 'label'>>;
export const AliasComposed = ({ label }: AliasComposedProps) => (
  <Child label={label} variant="chip" />
);
`,
    },
    // 62. Issue #1709, the real agora shape: the union lives in the SIBLING
    // module that exports the child, so crediting the member requires resolving
    // UnionChild.tsx off disk and enumerating UnionChildProps' arms.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { UnionChild } from './UnionChild';
import type { UnionChildChipProps } from './UnionChild';

type ChipRowProps = Readonly<Pick<UnionChildChipProps, 'label'>>;

export const ChipRow = ({ label }: ChipRowProps) => (
  <UnionChild label={label} variant="chip" />
);
`,
    },
    // 63. Issue #1709: the imported member renamed at the import site. The
    // composition is written with the LOCAL spelling, which is the only name the
    // parent file ever mentions.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { UnionChild } from './UnionChild';
import type { UnionChildChipProps as ChipProps } from './UnionChild';

type RenamedChipRowProps = Readonly<Pick<ChipProps, 'label'>>;

export const RenamedChipRow = ({ label }: RenamedChipRowProps) => (
  <UnionChild label={label} variant="chip" />
);
`,
    },
    // 64. Issue #1709: a memo-wrapped parent composing with a cross-file union
    // member — the wrapper must not hide the composition.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { memo } from 'react';
import { UnionChild } from './UnionChild';
import type { UnionChildChipProps } from './UnionChild';

type MemoChipRowProps = Readonly<Pick<UnionChildChipProps, 'label'>>;

export const MemoChipRow = memo(function MemoChipRowUnmemoized({
  label,
}: MemoChipRowProps) {
  return <UnionChild label={label} variant="chip" />;
});
`,
    },
    // 65. Issue #1709: the arms carry their own `Readonly<...>` wrapper. The
    // wrapper adds no surface, so `Readonly<ChildChipProps>` is still the
    // ChildChipProps arm.
    {
      filename: 'src/components/WrappedArmComposed.tsx',
      code: `
type ChildSwitchProps = { variant: 'switch'; label: string };
type ChildChipProps = { variant: 'chip'; label: string };
type ChildProps = Readonly<ChildSwitchProps> | Readonly<ChildChipProps>;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type WrappedArmComposedProps = Readonly<Pick<ChildChipProps, 'label'>>;
export const WrappedArmComposed = ({ label }: WrappedArmComposedProps) => (
  <Child label={label} variant="chip" />
);
`,
    },
    // 66. Issue #1709: a nested union alias flattens into the enclosing union in
    // TypeScript, so its arms are arms of the child's props type too.
    {
      filename: 'src/components/NestedArmComposed.tsx',
      code: `
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildIconProps = Readonly<{ variant: 'icon'; label: string }>;
type ChildToggleProps = ChildChipProps | ChildIconProps;
type ChildSwitchProps = Readonly<{ variant: 'switch'; label: string }>;
type ChildProps = ChildSwitchProps | ChildToggleProps;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type NestedArmComposedProps = Readonly<Pick<ChildIconProps, 'label'>>;
export const NestedArmComposed = ({ label }: NestedArmComposedProps) => (
  <Child label={label} variant="icon" />
);
`,
    },
    // 67. Issue #1709: the union is reached through the child's parameter
    // annotation rather than a {Child}Props alias, and through a Readonly
    // wrapper on the way — the agora spelling of the child side.
    {
      filename: 'src/components/ParamUnionComposed.tsx',
      code: `
type ChildSwitchProps = Readonly<{ variant: 'switch'; label: string }>;
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildVariantProps = ChildSwitchProps | ChildChipProps;
const Child = (props: Readonly<ChildVariantProps>) => <div>{props.label}</div>;
type ParamUnionComposedProps = Readonly<Pick<ChildChipProps, 'label'>>;
export const ParamUnionComposed = ({ label }: ParamUnionComposedProps) => (
  <Child label={label} variant="chip" />
);
`,
    },
    // 68. Issue #1776: a zero-parameter child declared INSIDE the component that
    // renders it has no props surface, exactly as a hoisted one does. Anchoring
    // the child lookup at Program.body made it unresolvable, and an unresolvable
    // child is read as one that takes props — so the rule demanded a
    // `SpinnerProps` that cannot be written, because Spinner declares no params.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { memo } from 'react';
export type PanelProps = Readonly<{ title: string }>;
export const Panel = memo(({ title }: PanelProps) => {
  const Spinner = memo(() => <div />);
  return <Card>{title}<Spinner /></Card>;
});
`,
    },
    // 69. Issue #1776: control for the case above with the child hoisted — the
    // shape that always passed. Both must be clean, or the carve-out is keyed on
    // declaration depth rather than on the child's parameter list.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { memo } from 'react';
const Spinner = memo(() => <div />);
export type PanelProps = Readonly<{ title: string }>;
export const Panel = ({ title }: PanelProps) => (
  <Card>{title}<Spinner /></Card>
);
`,
    },
    // 70. Issue #1776: inverse composition survives nesting. The child derives
    // its props FROM the parent's props type, so the parent is already the single
    // source of truth — a carve-out that vanished when the child moved into the
    // body it is rendered from.
    {
      filename: 'src/components/LiveBadge.tsx',
      code: `
export type LiveBadgeProps = { size: number; children?: React.ReactNode };
export const LiveBadge = ({ size, children }: LiveBadgeProps) => {
  const Live = ({ size: s }: Omit<LiveBadgeProps, 'children'>) => <span>{s}</span>;
  return <Live size={size}>{children}</Live>;
};
`,
    },
    // 71. Issue #1776: a nested component whose nested props alias DOES compose.
    // The alias lookup must reach the enclosing block, not just Program.body —
    // otherwise the composition is invisible and the rule falls silent for the
    // wrong reason (which case 5 of `invalid` pins from the other side).
    {
      filename: 'src/components/NestedComposed.tsx',
      code: `
function useRowFactory() {
  type RowProps = Readonly<Pick<LoadingButtonProps, 'loading'>> & {
    label: string;
  };
  const Row = ({ label, loading }: RowProps) => (
    <LoadingButton loading={loading}>{label}</LoadingButton>
  );
  return Row;
}
`,
    },
    // 72. Issue #1776: the same pair inside `export namespace`, whose body is a
    // TSModuleBlock rather than a BlockStatement.
    {
      filename: 'src/components/NamespaceComposed.tsx',
      code: `
export namespace Widgets {
  type WidgetButtonProps = Omit<LoadingButtonProps, 'onClick'> & {
    label: string;
  };
  export const WidgetButton = ({ label }: WidgetButtonProps) => (
    <LoadingButton>{label}</LoadingButton>
  );
}
`,
    },
    // 73. Issue #1776: an alias in a SIBLING scope must stay invisible. A
    // file-wide search would resolve this non-composing `SiblingButtonProps` and
    // report; lexical resolution cannot see it, so the props type is unresolved
    // and the rule skips — one scope's declarations never answer for another's.
    {
      filename: 'src/components/SiblingScope.tsx',
      code: `
function declaresElsewhere() {
  type SiblingButtonProps = { label: string };
  return null as unknown as SiblingButtonProps;
}
function rendersHere() {
  const SiblingButton = ({ label }: SiblingButtonProps) => (
    <LoadingButton>{label}</LoadingButton>
  );
  return SiblingButton;
}
`,
    },
    // 74. Issue #1776: an outer zero-prop child still applies when nothing
    // shadows it — the control for invalid case 67, which plants a shadow.
    {
      filename: 'src/components/OuterZeroProp.tsx',
      code: `
const Spinner = () => <div />;
export type PanelProps = Readonly<{ title: string }>;
export const Panel = ({ title }: PanelProps) => {
  return <Card>{title}<Spinner /></Card>;
};
`,
    },
    // 75. Issue #1776: the innermost declaration wins. A composing alias beside
    // the component shadows a same-named non-composing one at the top level, so
    // the file that reads the shadow is the file the verdict describes.
    {
      filename: 'src/components/ShadowedAlias.tsx',
      code: `
type ShadowButtonProps = { label: string };
function rendersHere() {
  type ShadowButtonProps = Pick<LoadingButtonProps, 'loading'> & {
    label: string;
  };
  const ShadowButton = ({ label, loading }: ShadowButtonProps) => (
    <LoadingButton loading={loading}>{label}</LoadingButton>
  );
  return ShadowButton;
}
`,
    },
  ],

  invalid: [
    // 1. Basic: Props defined in isolation while rendering non-leaf child
    {
      filename: DEFAULT_FILENAME,
      code: `
export type ShareUrlButtonProps = Readonly<{
  customUrl?: string;
  children?: string;
}>;
export const ShareUrlButton = ({ customUrl, children }: ShareUrlButtonProps) => {
  return (
    <Box>
      <ShareButtonBase>{children}</ShareButtonBase>
    </Box>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 2. Props doesn't compose with LoadingButton
    {
      filename: DEFAULT_FILENAME,
      code: `
type MyButtonProps = { label: string; disabled?: boolean; };
const MyButton = ({ label, disabled }: MyButtonProps) => {
  return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 3. Multiple deps, none composed, requireAllDependencies:false (default)
    {
      filename: DEFAULT_FILENAME,
      code: `
type MyFormProps = { onSubmit: () => void; };
const MyForm = ({ onSubmit }: MyFormProps) => (
  <Box>
    <TextField />
    <LoadingButton onClick={onSubmit}>Submit</LoadingButton>
  </Box>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 4. requireAllDependencies:true, only composes with one dep, other missing
    {
      filename: DEFAULT_FILENAME,
      options: [{ requireAllDependencies: true }],
      code: `
type LoadingButtonProps = { sx?: object; };
type MyDialogButtonProps = Pick<LoadingButtonProps, 'sx'> & { title: string; };
const MyDialogButton = ({ sx, title }: MyDialogButtonProps) => (
  <ConfirmDialog title={title}><LoadingButton sx={sx} /></ConfirmDialog>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 5. Props type found but uses plain type literal (no Pick/Omit)
    {
      filename: DEFAULT_FILENAME,
      code: `
type UserCardLayoutProps = { id: string; status: string; avatarProps: object; };
type FriendCardLayoutProps = {
  id: string;
  status: string;
  mutualFriendsCount?: number;
};
const FriendCardLayout = (props: FriendCardLayoutProps) => {
  return <UserCardLayout id={props.id} status={props.status} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 6. Export variant: exported component with isolated props
    {
      filename: DEFAULT_FILENAME,
      code: `
export type ThemedButtonProps = {
  children: React.ReactNode;
  variant?: string;
  color?: string;
};
export const ThemedButton = (props: ThemedButtonProps) => {
  return <Button {...props} sx={{ borderRadius: 2 }} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 7. Conditional rendering — both branches are non-leaf, none composed
    {
      filename: DEFAULT_FILENAME,
      code: `
type MediaDisplayProps = { type: string; src: string; };
const MediaDisplay = ({ type, src }: MediaDisplayProps) => {
  if (type === 'image') {
    return <ImageOptimized src={src} />;
  }
  return <VideoPlayer src={src} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 8. Component using spread pattern but props not composed
    {
      filename: DEFAULT_FILENAME,
      code: `
type BadChipTabProps = {
  isActive: boolean;
  label?: string;
  sx?: object;
};
const BadChipTab = ({ isActive, label, sx, ...rest }: BadChipTabProps) => {
  return <Chip sx={sx} label={label} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 9. Function declaration syntax
    {
      filename: DEFAULT_FILENAME,
      code: `
type ClipboardButtonProps = { value: string; description?: string; };
function ClipboardButton({ value, description }: ClipboardButtonProps) {
  return <ClipboardShare value={value} description={description} />;
}
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 10. Props uses TSIntersection but neither member references child props via Pick/Omit
    {
      filename: DEFAULT_FILENAME,
      code: `
type ExtraProps = { extra: string; };
type BaseProps = { label: string; };
type WrappedButtonProps = BaseProps & ExtraProps;
const WrappedButton = ({ label, extra }: WrappedButtonProps) => {
  return <LoadingButton>{label} {extra}</LoadingButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 11. Multiple non-excluded deps, requireAllDependencies:true, none composed
    {
      filename: DEFAULT_FILENAME,
      options: [{ requireAllDependencies: true }],
      code: `
type ShareUrlButtonProps = { customUrl?: string; };
const ShareUrlButton = ({ customUrl }: ShareUrlButtonProps) => (
  <Box>
    <ClipboardShareUrl value={customUrl} />
    <ShareButtonBase />
  </Box>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 12. Deeply nested JSX: child components buried in nested structure
    {
      filename: DEFAULT_FILENAME,
      code: `
type MenuButtonProps = { label: string; items: string[]; };
const MenuButton = ({ label, items }: MenuButtonProps) => (
  <Box>
    <div>
      <LoadingButton>{label}</LoadingButton>
    </div>
  </Box>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 13. Default targetPaths matched: src/components path
    {
      filename: 'src/components/buttons/SaveButton.tsx',
      code: `
type SaveButtonProps = { onSave: () => void; label?: string; };
const SaveButton = ({ onSave, label }: SaveButtonProps) => (
  <LoadingButton onClick={onSave}>{label}</LoadingButton>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 14. Memo-wrapped component without composition
    {
      filename: DEFAULT_FILENAME,
      code: `
import { memo } from 'react';
type CardProps = { title: string; };
const Card = memo(({ title }: CardProps) => (
  <UserCardLayout title={title} />
));
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 15. Custom targetPaths in options
    {
      filename: 'lib/widgets/Button.tsx',
      options: [{ targetPaths: ['lib/**/*.tsx'] }],
      code: `
type ButtonProps = { label: string; };
const Button = ({ label }: ButtonProps) => (
  <LoadingButton>{label}</LoadingButton>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 16. Issue #1268: an ABSOLUTE (POSIX) in-scope path must be enforced.
    // Before repo-relative resolution the raw minimatch never matched an
    // absolute path, so the rule silently no-op'd for every real filename.
    {
      filename: ABSOLUTE_FILENAME,
      code: `
type MyButtonProps = { label: string; disabled?: boolean; };
const MyButton = ({ label, disabled }: MyButtonProps) => {
  return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 17. Issue #1268: a Windows backslash in-scope path must be enforced too.
    {
      filename: WINDOWS_FILENAME,
      code: `
type MyButtonProps = { label: string; disabled?: boolean; };
const MyButton = ({ label, disabled }: MyButtonProps) => {
  return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 18. Issue #1307: the `*Icon` exclusion must NOT swallow IconButton — it
    // ends in "Button", is an interactive component with a real customization
    // surface, and remains a composition dependency.
    {
      filename: 'src/components/RetryControl.tsx',
      code: `
type RetryControlProps = { onRetry: () => void; };
const RetryControl = ({ onRetry }: RetryControlProps) => {
  return <IconButton onClick={onRetry}>Retry</IconButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 19. Issue #1307: dropping the icon still leaves a genuine non-leaf child
    // (Tooltip) in the dep set, so a non-composing component still fires.
    {
      filename: 'src/components/CopyButton.tsx',
      code: `
type CopyButtonProps = { overlayLinkId: string; onRetry: () => void; };
const CopyButton = ({ overlayLinkId, onRetry }: CopyButtonProps) => {
  return (
    <Tooltip title="Copy">
      <RefreshIcon onClick={onRetry} />
      <span>{overlayLinkId}</span>
    </Tooltip>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 20. Issue #1316: the direct-name check must match the DEP's props type name
    // exactly. A Props type that intersects a differently-named type
    // (SomeOtherProps, not ChildPlainProps) still fails to compose with the
    // rendered ChildPlain — still flagged.
    {
      filename: DEFAULT_FILENAME,
      code: `
type SomeOtherProps = { hits: readonly string[]; };
export type ParentProps = SomeOtherProps & { x: string };
const Parent = (props: ParentProps) => {
  return <ChildPlain {...props} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 21. Issue #1316: the zero-param filter must NOT catch an in-file child that
    // DOES take props. ChildWithProps has one parameter, so it stays a
    // composition dependency; the parent does not compose with
    // ChildWithPropsProps — still flagged.
    {
      filename: DEFAULT_FILENAME,
      code: `
type ChildWithPropsProps = { value: string; };
const ChildWithProps = (props: ChildWithPropsProps) => <div>{props.value}</div>;
type ParentProps = { title: string; };
const Parent = ({ title }: ParentProps) => {
  return (
    <div>
      {title}
      <ChildWithProps value={title} />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 22. Issue #1316 (reopened): the relaxation requires POSITIVE proof of a
    // zero-parameter child. ChildWithProps.tsx exists on disk and declares a
    // props parameter, so it stays a composition dependency — still flagged.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ChildWithProps } from './ChildWithProps';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <ChildWithProps value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 23. Issue #1316 (reopened): fail-safe direction. The imported module does
    // not resolve to any file on disk, so nothing is proven and the rule keeps
    // its normal behavior — an unresolvable import must never silence it.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { MissingChild } from './MissingChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <MissingChild />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 24. Issue #1316 (reopened): a package import is never resolved from disk,
    // so a child from node_modules keeps demanding composition.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { LoadingButton } from '@mui/lab';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <LoadingButton>{title}</LoadingButton>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 25. Issue #1316 (reopened): the prop-less import is dropped from the
    // dependency set, not used to suppress the report — a sibling child that
    // genuinely needs composition still fires.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { BestOfText } from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <BestOfText />
    <LoadingButton>{title}</LoadingButton>
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 26. Issue #1316 (reopened), defect D1: OverloadedChild.tsx declares
    // TypeScript overload signatures ahead of an implementation that TAKES
    // props. The zero-parameter overload must not stand in for the
    // implementation, so the child stays a composition dependency.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { OverloadedChild } from './OverloadedChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <OverloadedChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 27. Issue #1316 (reopened), defect D2: NestedShadowChild.tsx exports a
    // props-taking component and also declares a same-named zero-argument
    // function inside another function. Only the exported binding decides, so
    // the nested namesake must not drop the child.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { NestedShadowChild } from './NestedShadowChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <NestedShadowChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 28. Issue #1316 (reopened), defect D3: TemplateTrapChild.tsx holds a
    // nested template literal whose text reads as a zero-argument declaration of
    // the component, ahead of the real props-taking one. A string can never
    // prove a declaration, so the child stays a composition dependency.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { TemplateTrapChild } from './TemplateTrapChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <TemplateTrapChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 29. Issue #1316 (reopened): a re-export (`export { X as Y } from './z'`)
    // resolves nothing — the definition lives in another module — so the child
    // keeps demanding composition. Ambiguity always fails toward reporting.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ReExportedChild } from './ReExportedChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <ReExportedChild />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 30. Issue #1316 (reopened), defect 1: `lazy(() => import('./X'))` forwards
    // X's ENTIRE props surface. Unwrapping an arbitrary call expression made the
    // zero-parameter loader arrow stand in for the component and silently
    // dropped the dependency.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { LazyChild } from './LazyChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <LazyChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 31. Issue #1316 (reopened), defect 1: the same hole reached through
    // `dynamic(() => import('./X'), { ssr: false })` — the exact shape this
    // plugin's own prefer-next-dynamic autofix writes.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { DynamicChild } from './DynamicChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <DynamicChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 32. Issue #1316 (reopened), defect 1: `styled(Box)(() => ({...}))` — the
    // zero-parameter argument is a style callback, not a component, and the
    // binding inherits Box's whole props surface.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { StyledChild } from './StyledChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <StyledChild sx={{ color: title }} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 33. Issue #1316 (reopened), defect 1: an arbitrary props-injecting HOC.
    // Only an allowlisted props-preserving wrapper may be unwrapped.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { InjectedChild } from './InjectedChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <InjectedChild tooltip={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 34. Issue #1316 (reopened), defect 1: a curried HOC
    // (`connect(mapState)(Component)`) whose callee is itself a call expression.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { ConnectedChild } from './ConnectedChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <ConnectedChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 35. Issue #1316 (reopened), defect 1: the default-export form of the same
    // hole — `export default lazy(() => import('./X'))`.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultLazyChild from './DefaultLazyChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <DefaultLazyChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 36. Issue #1316 (reopened), defect 2: the rendered name is SHADOWED by a
    // local declaration inside the component, so the module-level import is not
    // what the JSX resolves to and proves nothing about it. Matching the import
    // by name alone silenced this — a regression against pre-relaxation
    // behavior, since the local child takes props and does not compose.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  const PropLessKid = ({ value }: { value: string }) => <span>{value}</span>;
  return (
    <div>
      {title}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 37. Issue #1316 (reopened): the resolved child module does not PARSE
    // (UnparsableChild.tsx holds an unclosed JSX attribute). A file that cannot
    // be parsed proves nothing about its exported binding, so the child stays a
    // composition dependency — the fail-safe direction.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { UnparsableChild } from './UnparsableChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <UnparsableChild />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 38. Issue #1316 (reopened): a NAMESPACE import binds a module object, not
    // the exported component, so no single export decides its props surface and
    // the relaxation must not apply.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import * as BestOfText from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 39. Issue #1316 (reopened): an inline TYPE-ONLY specifier
    // (`import { type X }`) introduces no value binding, so whatever the JSX
    // renders does not come from this import and nothing is proven.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { type BestOfText } from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 40. Issue #1316 (reopened): a DEFAULT import of a module that exports no
    // default at all (BestOfText.tsx has only a named export). The binding
    // resolves to nothing, so the child keeps demanding composition.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import BestOfText from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 41. Issue #1316 (reopened): a default-exported CLASS component. Only a
    // zero-parameter function component is provably prop-less, so a class
    // default export resolves to nothing and still reports.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultClassChild from './DefaultClassChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <DefaultClassChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 42. Issue #1316 (reopened): a props-preserving wrapper call with NO
    // argument (`export default memo()`) has no wrapped function to inspect, so
    // the parameter list is unknowable and the child still reports.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultEmptyCallChild from './DefaultEmptyCallChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <DefaultEmptyCallChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 43. Issue #1316 (reopened): `export default <Identifier>` is followed to
    // its declaration, which TAKES props — the alias must report the real
    // parameter list rather than relax the rule.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import DefaultAliasPropsChild from './DefaultAliasPropsChild';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    <DefaultAliasPropsChild value={title} />
  </div>
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 44. Issue #1316 (reopened), defect 2: an ARRAY-destructured binding
    // shadows the import, so the JSX name is whatever the tuple holds — the
    // import describes nothing and the child stays a dependency.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  const [PropLessKid] = kidTuple;
  return (
    <div>
      {title}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 45. Issue #1316 (reopened), defect 2: a DEFAULT-VALUED destructure
    // (`{ PropLessKid = Fallback }`) binds the name just as surely as a plain
    // one, so it too defeats the import-based proof.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  const { PropLessKid = FallbackKid } = kidRegistry;
  return (
    <div>
      {title}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 46. Issue #1316 (reopened), defect 2: an OBJECT REST element
    // (`{ ...PropLessKid }`) binds the name to the remaining properties.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  const { key, ...PropLessKid } = kidRegistry;
  return (
    <div>
      {title}
      <PropLessKid value={key} />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 47. Issue #1316 (reopened), defect 2: a REST PARAMETER named for the child
    // binds the name inside the component, so the module-level import is not
    // what the JSX resolves to.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  const countKids = (...PropLessKid: readonly string[]) => PropLessKid.length;
  return (
    <div>
      {countKids(title)}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 48. Issue #1316 (reopened), defect 2: a plain function PARAMETER named for
    // the child shadows the import over the whole callback.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  const renderKid = (PropLessKid: React.ComponentType<{ value: string }>) => (
    <PropLessKid value={title} />
  );
  return <div>{renderKid(FallbackKid)}</div>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 49. Issue #1316 (reopened), defect 2: a FUNCTION DECLARATION of the same
    // name inside the component wins over the import.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  function PropLessKid({ value }: { value: string }) {
    return <span>{value}</span>;
  }
  return (
    <div>
      {title}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 50. Issue #1316 (reopened), defect 2: a CLASS DECLARATION of the same name
    // inside the component likewise replaces the imported binding.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  class PropLessKid extends React.Component<{ value: string }> {
    public render() {
      return <span>{this.props.value}</span>;
    }
  }
  return (
    <div>
      {title}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 51. Issue #1316 (reopened), defect 2: a CATCH parameter named for the
    // child. The shadow check is deliberately scope-blind — over-detecting a
    // shadow costs only a report, while missing one silently drops a dependency
    // the import never described.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { PropLessKid } from './PropLessKid';

export type ProbeParentProps = Readonly<{ title: string }>;

export const ProbeParent = ({ title }: ProbeParentProps) => {
  try {
    hydrate(title);
  } catch (PropLessKid) {
    report(PropLessKid);
  }
  return (
    <div>
      {title}
      <PropLessKid value="x" />
    </div>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 52. A props type literal whose members are an index signature and a method
    // signature carries no property type to recurse into, so no composition is
    // found and the rendered child is still flagged. The module-level
    // destructuring declaration is not a component and must be skipped.
    {
      filename: DEFAULT_FILENAME,
      code: `
const { defaults } = telemetryConfig;

type TelemetryPanelProps = {
  [key: string]: unknown;
  onRefresh(): void;
};

const TelemetryPanel = (props: TelemetryPanelProps) => {
  return <LoadingButton {...props}>{defaults.label}</LoadingButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 53. No `<Component>Props` alias exists, so the props type comes from the
    // parameter annotation — unwrapped out of Readonly<...> and resolved to the
    // shared alias it names. That alias composes with nothing, so the child is
    // still flagged (without the unwrap the type would be unresolvable and the
    // component silently skipped).
    {
      filename: DEFAULT_FILENAME,
      code: `
type SharedActionProps = { label: string; onAct: () => void };

const ToolbarAction = (props: Readonly<SharedActionProps>) => {
  return <LoadingButton onClick={props.onAct}>{props.label}</LoadingButton>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 54. The rendered child takes an UNTYPED parameter, so there is no
    // dependency props type to test for inverse composition — and, taking a
    // parameter at all, it is not prop-less either. Still flagged.
    {
      filename: DEFAULT_FILENAME,
      code: `
const SummaryRow = (props) => <div>{props.title}</div>;

type SummaryPanelProps = { title: string };

const SummaryPanel = ({ title }: SummaryPanelProps) => {
  return <SummaryRow title={title} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 55. Issue #1374: dropping the prop slot must not suppress a genuine
    // sibling dependency. `Slot` is caller-injected, but `LoadingButton` is a
    // fixed child that still owes composition.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { ComponentType } from 'react';

type SlotPanelProps = {
  Slot: ComponentType<{ value: string }>;
  value: string;
};

const SlotPanel = ({ Slot, value }: SlotPanelProps) => {
  return (
    <Box>
      <Slot value={value} />
      <LoadingButton>{value}</LoadingButton>
    </Box>
  );
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 56. Issue #1374: a capitalized binding destructured from an ordinary
    // object — not the props parameter — is still an in-scope component and
    // keeps its composition obligation.
    {
      filename: DEFAULT_FILENAME,
      code: `
import { registry } from './registry';

type RegistryPanelProps = { value: string };

const RegistryPanel = ({ value }: RegistryPanelProps) => {
  const { Widget } = registry;
  return <Widget value={value} />;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 57. Issue #1709 regression guard: crediting union MEMBERS must not degrade
    // into "any referenced type counts". This parent composes with nothing at
    // all while the child's props are a union, so it still reports.
    {
      filename: 'src/components/NoComposition.tsx',
      code: `
type ChildSwitchProps = Readonly<{ variant: 'switch'; label: string }>;
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildProps = ChildSwitchProps | ChildChipProps;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type NoCompositionProps = Readonly<{ label: string }>;
export const NoComposition = ({ label }: NoCompositionProps) => (
  <Child label={label} variant="chip" />
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 58. Issue #1709: composing with a named type that is NOT a member of the
    // child's union proves nothing about the child's surface, so it reports.
    // Distinguishes "a member of the union" from "any sibling alias in scope".
    {
      filename: 'src/components/StrangerComposed.tsx',
      code: `
type ChildSwitchProps = Readonly<{ variant: 'switch'; label: string }>;
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildProps = ChildSwitchProps | ChildChipProps;
type UnrelatedProps = Readonly<{ label: string; href: string }>;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type StrangerComposedProps = Readonly<Pick<UnrelatedProps, 'label'>>;
export const StrangerComposed = ({ label }: StrangerComposedProps) => (
  <Child label={label} variant="chip" />
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 59. Issue #1709: the cross-file mirror of the guard above — the sibling
    // module really is resolved, and it really does hold a union, yet a parent
    // composing with nothing still reports.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { UnionChild } from './UnionChild';

type BareChipRowProps = Readonly<{ label: string }>;

export const BareChipRow = ({ label }: BareChipRowProps) => (
  <UnionChild label={label} variant="chip" />
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 60. Issue #1709: a type exported from the child's own module that is NOT
    // an arm of the child's props union proves nothing about the child's
    // surface, so co-location in the resolved module is not enough.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { UnionChild } from './UnionChild';
import type { SoloChildProps } from './UnionChild';

type StrangerChipRowProps = Readonly<Pick<SoloChildProps, 'label'>>;

export const StrangerChipRow = ({ label }: StrangerChipRowProps) => (
  <UnionChild label={label} variant="chip" />
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 61. Issue #1709: the resolved child's props are a single shape rather than
    // a union, so there are no members to credit and the unrelated composition
    // still reports.
    {
      filename: FIXTURE_FILENAME,
      options: FIXTURE_OPTIONS,
      code: `
import { SoloChild } from './UnionChild';
import type { UnionChildChipProps } from './UnionChild';

type SoloRowProps = Readonly<Pick<UnionChildChipProps, 'label'>>;

export const SoloRow = ({ label }: SoloRowProps) => (
  <SoloChild label={label} />
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 62. Issue #1709: resolving TOWARDS a union must not name the aliases it
    // passes through. `ChildProps` is a plain alias chain ending at an object
    // type — there is no union and therefore no member to credit.
    {
      filename: 'src/components/ChainComposed.tsx',
      code: `
type ChildShapeProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildProps = ChildShapeProps;
const Child = (props: ChildProps) => <div>{props.label}</div>;
type ChainComposedProps = Readonly<Pick<ChildShapeProps, 'label'>>;
export const ChainComposed = ({ label }: ChainComposedProps) => (
  <Child label={label} variant="chip" />
);
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 63. Issue #1776: a genuine violation nested inside a function body. The
    // component and its props alias both sit in the block, so a Program.body
    // lookup resolved neither and the rule went silent on a real violation.
    {
      filename: 'src/components/NestedViolation.tsx',
      code: `
function useButtonFactory() {
  type MyButtonProps = { label: string; disabled?: boolean };
  const MyButton = ({ label, disabled }: MyButtonProps) => {
    return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
  };
  return MyButton;
}
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 64. Issue #1776: the same violation inside `export namespace`, a legal
    // nesting whose body is a TSModuleBlock.
    {
      filename: 'src/components/NamespaceViolation.tsx',
      code: `
export namespace Widgets {
  type MyButtonProps = { label: string; disabled?: boolean };
  export const MyButton = ({ label, disabled }: MyButtonProps) => {
    return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
  };
}
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 65. Issue #1776, the MIXED control: a nested component whose props alias
    // stays at the top level. This shape reported before the lexical lookups and
    // must keep reporting — the pre-fix behaviour under nesting was partial, not
    // a deliberate module-scope gate, and the fix must not flip it to a gate.
    {
      filename: 'src/components/MixedScope.tsx',
      code: `
type MyButtonProps = { label: string; disabled?: boolean };
function useButtonFactory() {
  const MyButton = ({ label, disabled }: MyButtonProps) => {
    return <LoadingButton disabled={disabled}>{label}</LoadingButton>;
  };
  return MyButton;
}
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 66. Issue #1776: a nested child that DOES take props is still a
    // composition dependency. The zero-parameter carve-out must key on the
    // resolved parameter list, not on "the child was found in the body".
    {
      filename: 'src/components/NestedPropfulChild.tsx',
      code: `
export type PanelProps = Readonly<{ title: string }>;
export const Panel = ({ title }: PanelProps) => {
  const Badge = ({ tone }: { tone: string }) => <span>{tone}</span>;
  return <Card>{title}<Badge tone="warn" /></Card>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
    // 67. Issue #1776: walking outward must STOP at the binding the JSX resolves
    // to. The inner `lazy(...)` shadows the outer zero-prop `Spinner`; treating
    // the unprovable inner binding as "not declared here" would let the outer one
    // answer for it and silently drop a child that does take props — the
    // masquerade the zero-parameter proof exists to prevent (issue #1316).
    {
      filename: 'src/components/ShadowedZeroProp.tsx',
      code: `
import { lazy } from 'react';
const Spinner = () => <div />;
export type PanelProps = Readonly<{ title: string }>;
export const Panel = ({ title }: PanelProps) => {
  const Spinner = lazy(() => import('./HeavySpinner'));
  return <Card>{title}<Spinner /></Card>;
};
`,
      errors: [{ messageId: 'missingPropsComposition' }],
    },
  ],
});

// Issue #1316 (reopened), defect 3: the prop-less verdict is memoized across the
// whole process, so under a long-lived host (the VS Code ESLint extension,
// eslint_d) a child that GAINS props after a first lint must not keep its stale
// "prop-less" verdict — that leaves every parent silently unreported until the
// process restarts. RuleTester cannot rewrite a file between cases, so the rule
// is driven through Linter directly here.
describe('require-props-composition: on-disk child changes (issue #1316)', () => {
  const FIXTURE_DIR = path.join(
    __dirname,
    'fixtures/require-props-composition',
  );
  const PROBE_CHILD = path.join(FIXTURE_DIR, 'MutatingProbeChild.tsx');
  const PROBE_PARENT = path.join(FIXTURE_DIR, 'MutatingProbeParent.tsx');
  const PROBE_PARENT_CODE = `
import { MutatingProbeChild } from './MutatingProbeChild';

export type MutatingProbeParentProps = Readonly<{ title: string }>;

export const MutatingProbeParent = ({ title }: MutatingProbeParentProps) => (
  <div>
    {title}
    <MutatingProbeChild value={title} />
  </div>
);
`;

  const PROP_LESS_CHILD = 'export const MutatingProbeChild = () => <div />;\n';
  const WITH_PROPS_CHILD =
    'export const MutatingProbeChild = (props: { value: string }) => <div>{props.value}</div>;\n';
  // Same byte length as WITH_PROPS_CHILD, so only the mtime distinguishes them.
  // This proves the timestamp — not just the size — participates in the stamp.
  const PROP_LESS_CHILD_SAME_SIZE = PROP_LESS_CHILD.padEnd(
    WITH_PROPS_CHILD.length,
    ' ',
  );

  const lintProbeParent = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/require-props-composition',
      requirePropsComposition as unknown as Rule.RuleModule,
    );
    return linter.verify(
      PROBE_PARENT_CODE,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: {
          'test/require-props-composition': [
            'error',
            { targetPaths: FIXTURE_TARGET_PATHS },
          ],
        },
      },
      PROBE_PARENT,
    );
  };

  const writeChild = (source: string) => {
    fs.writeFileSync(PROBE_CHILD, source);
    // Coarse filesystem timestamps can collapse two writes onto one mtime;
    // stepping it forward explicitly keeps the probe deterministic.
    const stepped = new Date(Date.now() + 60_000);
    fs.utimesSync(PROBE_CHILD, stepped, stepped);
  };

  afterAll(() => {
    fs.rmSync(PROBE_CHILD, { force: true });
  });

  it('re-reads a child whose props surface changes on disk', () => {
    writeChild(PROP_LESS_CHILD);
    expect(lintProbeParent()).toHaveLength(0);

    writeChild(WITH_PROPS_CHILD);
    expect(lintProbeParent()).toHaveLength(1);

    // Back to prop-less at an identical byte length: the verdict must follow the
    // file rather than a stale cache entry, so the timestamp has to carry it.
    expect(PROP_LESS_CHILD_SAME_SIZE).toHaveLength(WITH_PROPS_CHILD.length);
    writeChild(PROP_LESS_CHILD_SAME_SIZE);
    expect(lintProbeParent()).toHaveLength(0);
  });

  it('reports again once a resolved child is deleted', () => {
    writeChild(PROP_LESS_CHILD);
    expect(lintProbeParent()).toHaveLength(0);

    fs.rmSync(PROBE_CHILD, { force: true });
    expect(lintProbeParent()).toHaveLength(1);
  });
});

// Issue #1476: a non-absolute filename must be anchored at the directory ESLint
// was configured with, not the node process cwd. Anchoring at the process cwd
// resolves the sibling import against the wrong directory, the prop-less
// relaxation silently stops applying, and the parent reports a composition it
// cannot satisfy. RuleTester cannot express this — its Linter's cwd defaults to
// the process cwd, making the two reads indistinguishable — so the rule is
// driven through a Linter with an explicit cwd that is NOT the process cwd.
describe('require-props-composition: relative filenames anchor at the configured cwd', () => {
  // The parent is supplied as text and never written to disk; only the child
  // (`BestOfText.tsx`) has to exist for the prop-less proof to succeed.
  const RELATIVE_PARENT = 'fixtures/require-props-composition/CwdAnchored.tsx';
  const PARENT_CODE = `
import { BestOfText } from './BestOfText';

export type CwdAnchoredProps = Readonly<{ title: string }>;

export const CwdAnchored = ({ title }: CwdAnchoredProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
`;

  const lintRelativeParentWithCwd = (cwd: string) => {
    const linter = new Linter({ cwd });
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/require-props-composition',
      requirePropsComposition as unknown as Rule.RuleModule,
    );
    return linter.verify(
      PARENT_CODE,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: {
          'test/require-props-composition': [
            'error',
            { targetPaths: FIXTURE_TARGET_PATHS },
          ],
        },
      },
      RELATIVE_PARENT,
    );
  };

  it('resolves the sibling child from the configured cwd', () => {
    // `__dirname` is the only directory the relative filename resolves against
    // correctly, and it is never the jest process cwd (the repo root).
    expect(__dirname).not.toBe(process.cwd());

    expect(lintRelativeParentWithCwd(__dirname)).toHaveLength(0);
  });

  it('still reports when the configured cwd cannot resolve the child', () => {
    // Control: the assertion above is not vacuous — the same file under a cwd
    // where the child does not exist is unresolvable, so the relaxation does
    // not apply and the composition requirement stands.
    expect(lintRelativeParentWithCwd(os.tmpdir())).toHaveLength(1);
  });
});
