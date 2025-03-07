# Enforce that useMemo hooks explicitly returning JSX should be abstracted into separate React components (`@blumintinc/blumint/react-usememo-should-be-component`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

> Enforce that useMemo hooks returning React nodes should be abstracted into separate React components

- ⚙️ This rule is enabled in the ✅ `recommended` config.

## Rule Details

This rule enforces that useMemo hooks returning React nodes should be abstracted into separate React components. The goal is to improve code maintainability and reusability by discouraging the use of useMemo for defining component structures inline.

Using useMemo to memoize JSX elements is an anti-pattern because:

1. It makes the code harder to read and maintain
2. It hides component logic inside another component
3. It prevents proper component reuse
4. React already provides a better mechanism for this: React.memo()

### Examples

❌ **Incorrect** code:

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

✅ **Correct** code:

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

1. You're working with a legacy codebase that heavily uses this pattern and refactoring would be too time-consuming
2. You have specific performance requirements that necessitate this pattern (though this is rare)

## Rule Exceptions

This rule automatically allows the following exceptions:

1. When the memoized JSX element is used multiple times within the same component. In this case, extracting it as a separate component could lead to unnecessary code duplication or require passing additional props.

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
