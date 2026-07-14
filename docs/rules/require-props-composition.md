# Require React component Props types to compose (via Pick/Omit) with the props types of non-leaf child components rendered in JSX (`@blumintinc/blumint/require-props-composition`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforces that a React component's Props type composes (via `Pick<ChildProps, ...>` or `Omit<ChildProps, ...>`) with the Props types of non-leaf child components it renders in JSX. When a parent component renders a child component but its Props type doesn't compose with the child's Props type, consumers cannot customize the underlying child without the parent explicitly forwarding each prop one by one.

## Why This Matters

- **Forward-compatibility**: When dependency components gain new props, composed types automatically inherit them without manual updates.
- **DRY principle**: Prevents duplication of prop definitions that already exist in dependency component types.
- **Customization surface**: Consumers can customize nested components without the parent needing explicit prop forwarding for every option.
- **Aligns with TypeScript conventions**: Use `Pick`, `Omit`, `Partial`, etc. rather than redefining fields — especially for React component Props type definitions.

## Rule Details

The rule inspects each React component that:
1. Is defined in a file matching `targetPaths` (default: `src/components/**/*.tsx`)
2. Declares a Props type alias (e.g. `type MyComponentProps = ...`)
3. Renders one or more capitalized JSX elements that are not in the `excludeComponents` list

If the Props type does not reference any rendered dependency's Props type via `Pick<...>` or `Omit<...>` (including inside `Readonly<...>` and intersection types `&`), the rule reports a warning.

Composition is also recognized inside nested property types, e.g.:
```tsx
type CopyButtonProps = {
  iconProps?: Omit<GradientIconButtonProps, 'IconComponent'>;
};
```

### Inverse composition

Composition is recognized in **both directions**. If a rendered child instead
derives *its* props from the parent's props type — via `Pick<ParentProps, ...>`,
`Omit<ParentProps, ...>`, or `Readonly<...>` of either — the parent is the single
shared source of truth and the anti-duplication guarantee is already met, so the
child is treated as composed. This holds whether the child has a named
`{Child}Props` alias or the derivation is written inline on the child's first
parameter (with no `{Child}Props` type at all):

```tsx
type LiveBadgeProps = { children?: JSX.Element; size?: string };

// Child derives from the parent — no LiveProps needed.
const Live = ({ size }: Omit<LiveBadgeProps, 'children'>) => <span>{size}</span>;

const LiveBadge = ({ children, size }: LiveBadgeProps) => (
  <>
    {children}
    <Live size={size} />
  </>
);
```

## Options

```js
'@blumintinc/blumint/require-props-composition': ['warn', {
  // Glob patterns for files to check (default: ['src/components/**/*.tsx'])
  targetPaths: ['src/components/**/*.tsx'],

  // Component names to skip as "leaf" components that don't need composition
  // (merged with the built-in default exclusions)
  excludeComponents: ['Box', 'Stack', 'Typography', 'Fragment'],

  // Minimum number of non-excluded dependency components before the rule applies
  minDependencyCount: 1,

  // When false (default), flag only when Props composes with NONE of the deps.
  // When true, flag when Props is missing composition with ANY dep.
  requireAllDependencies: false,
}]
```

### Default `excludeComponents`

The built-in list includes layout and utility primitives that don't benefit from composition:
`Box`, `Stack`, `Typography`, `Fragment`, `Divider`, `Container`, `Grid`, `Paper`, `Card`, `CardContent`, `CardHeader`, `CardActions`, `List`, `ListItem`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableRow`, `Toolbar`, `AppBar`, `Drawer`, `Modal`, `Backdrop`, `Collapse`, `Fade`, `Grow`, `Slide`, `Zoom`, `CircularProgress`, `LinearProgress`, `Skeleton`, `Suspense`, `StrictMode`, `Profiler`, `ErrorBoundary`, `React.Fragment`, `React.Suspense`, `React.StrictMode`.

Any component whose name ends in `Icon` (e.g. `CheckIcon`, `RefreshIcon` from `@mui/icons-material`) is also treated as a decorative leaf and excluded — icons expose no composable customization surface a parent should re-expose. Interactive components like `IconButton` are unaffected (they end in `Button`, not `Icon`).

## Examples

### Incorrect

```tsx
// src/components/header/ShareUrlButton.tsx
export type ShareUrlButtonProps = Readonly<{
  customUrl?: string;
  children?: string | ReactNode;
}>;

export const ShareUrlButton = ({ customUrl, children }: ShareUrlButtonProps) => {
  return (
    <Box sx={{ display: 'flex' }}>
      <ClipboardShareUrl description={description} value={urlCopied}>
        <ShareButtonBase guide={guide}>{children}</ShareButtonBase>
      </ClipboardShareUrl>
    </Box>
  );
};
// Problem: ShareUrlButtonProps doesn't compose with ClipboardShareUrlProps
// or ShareButtonBaseProps — consumers cannot customize those components.
```

```tsx
type BadChipTabProps = Readonly<{
  isActive: boolean;
  label?: string;
  sx?: SxProps; // Manually added instead of inherited
}>;

const BadChipTab = ({ isActive, label, sx, ...rest }: BadChipTabProps) => {
  return <Chip sx={sx} label={label} />;
};
// Problem: ManualSxProps instead of Omit<ChipProps, 'variant'>
```

### Correct

```tsx
// src/components/cards/friend/FriendCardLayout.tsx
export type FriendCardLayoutProps = Omit<UserCardLayoutProps, 'avatarProps'> & {
  mutualFriendsCountEstimate?: number;
  children?: ReactNode;
};

const FriendCardLayout = ({
  children,
  mutualFriendsCountEstimate,
  ...props
}: FriendCardLayoutProps) => (
  <UserCardLayout {...props}>
    {children}
  </UserCardLayout>
);
```

```tsx
// src/components/wallet/transfer/WithdrawButton.tsx
export type WithdrawButtonProps = Readonly<
  Pick<LoadingButtonProps, 'sx' | 'size'>
>;

const WithdrawButton = forwardRef<HTMLButtonElement, WithdrawButtonProps>(
  (props, ref) => (
    <LoadingButton {...props} ref={ref} color="secondary">
      Withdraw
    </LoadingButton>
  )
);
```

```tsx
// Nested composition via property type
type CopyButtonProps = {
  value: string;
  iconProps?: Omit<GradientIconButtonProps, 'IconComponent'>;
};

const CopyButton = ({ value, iconProps }: CopyButtonProps) => (
  <ClipboardShare value={value}>
    <GradientIconButton {...iconProps} />
  </ClipboardShare>
);
```

## When to Disable

- When a component intentionally does NOT expose any props from its child components (e.g., it fully controls all aspects of the child's configuration).
- For legacy components during migration. Enable the rule as `'warn'` first, then fix components incrementally.
- When the child component's Props type is not importable (e.g., it's defined inline without an export).
