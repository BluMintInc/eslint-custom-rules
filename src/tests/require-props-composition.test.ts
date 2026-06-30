import { ruleTesterJsx } from '../utils/ruleTester';
import { requirePropsComposition } from '../rules/require-props-composition';

const DEFAULT_FILENAME = 'src/components/MyComponent.tsx';

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
  ],
});
