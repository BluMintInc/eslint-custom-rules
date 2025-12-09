# Enforce that useMemo hooks explicitly returning JSX should be abstracted into separate React components (`@blumintinc/blumint/react-usememo-should-be-component`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

> Enforce that useMemo hooks returning React nodes are extracted into real components instead of memoized values.

- ⚙️ This rule is enabled in the ✅ `recommended` config.

## Why useMemo should not return JSX

- JSX inside `useMemo` has no component identity, so React cannot track props, state, or errors the way it does for components.
- Memoizing JSX hides a component boundary inside another component, which makes debugging, testing, and reuse harder.
- `React.memo` already provides memoization for components while keeping the component boundary visible to React DevTools and to callers.

## Rule Details

The rule reports when a `useMemo` callback returns JSX/ReactNode and the memoized value is not:

- reused multiple times inside the same component (where memoization avoids duplication), or
- forwarded as a prop/spread value into other components (treated as component content).

When reported, move the JSX into a dedicated component and, if stability is required, wrap that component with `React.memo`.

### Examples

❌ **Incorrect**: useMemo hides a component inside another component

```jsx
const LivestreamInfo = ({ streamer, title, description }) => {
  const { imgUrl, username } = streamer;

  const userAvatar = useMemo(() => {
    return (
      <Link href={`/${username}`} style={LINK_STYLE}>
        <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
      </Link>
    );
  }, [imgUrl, username]);

  const header = useMemo(() => {
    return (
      <Stack alignItems="flex-start">
        <Typography sx={{ lineHeight: '28px' }} variant="h5">
          {title}
        </Typography>
      </Stack>
    );
  }, [title]);

  return (
    <Stack>
      {userAvatar}
      {header}
    </Stack>
  );
};
```

✅ **Correct**: extract components and memoize with `React.memo`

```jsx
// UserAvatar.tsx
export const UserAvatar = memo(({ imgUrl, username }) => (
  <Link href={`/${username}`} style={LINK_STYLE}>
    <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
  </Link>
));

// HeaderComponent.tsx
export const Header = memo(({ title }) => (
  <Stack alignItems="flex-start">
    <Typography sx={{ lineHeight: '28px' }} variant="h5">
      {title}
    </Typography>
  </Stack>
));

// LivestreamInfo.tsx
export const LivestreamInfo = ({ streamer, title, description }) => {
  return (
    <Stack>
      <UserAvatar imgUrl={streamer.imgUrl} username={streamer.username} />
      <Header title={title} />
    </Stack>
  );
};
```

## When Not To Use It

You might consider disabling this rule if:

1. You are working in a legacy codebase where extracting components is infeasible.
2. You have a benchmarked performance requirement that is only satisfied by memoizing JSX inside `useMemo` (this is rare; prefer `React.memo` first).

## Rule Exceptions

This rule automatically allows:

1. Memoized JSX that is reused multiple times within the same component (to avoid duplication).
2. Memoized JSX that is passed through as a prop or spread attribute to other components.

Example of allowed usage (memoized JSX used multiple times):

```jsx
const AvatarStatusUnmemoized = ({
  onlineStatus,
  imgUrl,
  height,
  width,
  showStatus = false,
  badgeSx = DEFAULT_SX,
  avatarSx = DEFAULT_SX,
  ...props
}) => {
  const theme = useTheme();

  // This is allowed because the avatar is used multiple times
  const avatar = useMemo(() => {
    return (
      <AvatarNext
        height={height}
        src={imgUrl}
        sx={avatarSx}
        width={width}
        {...props}
      />
    );
  }, [imgUrl, height, width, avatarSx, props]);

  if (!showStatus) {
    return avatar;
  }

  return (
    <StatusBadge
      color={onlineStatus}
      sx={{
        '& .MuiBadge-badge': {
          borderRadius: '50%',
          height: '14px',
          width: '14px',
          border: `2px solid ${theme.palette.background.elevation[6]}`,
          boxShadow: `inset 0 0 0 1px ${theme.palette.text.primary}`,
          ...badgeSx?.['.MuiBadge-badge'],
        },
        ...badgeSx,
      }}
    >
      {avatar}
    </StatusBadge>
  );
};
```

## Further Reading

- [React.memo documentation](https://reactjs.org/docs/react-api.html#reactmemo)
- [useMemo documentation](https://reactjs.org/docs/hooks-reference.html#usememo)
