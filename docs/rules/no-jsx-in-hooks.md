# Prevent hooks from returning JSX (`@blumintinc/blumint/no-jsx-in-hooks`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Hooks should expose data, effects, and callbacks so components decide how to render. Returning JSX turns a hook into a hidden component, forces callers to run hook logic just to get markup, and makes reuse harder because the hook now owns UI lifecycle decisions. Keep JSX in components and return the values the UI needs instead.

## Rule Details

This rule reports hooks whose return type annotation names a JSX type, and hooks that return JSX from block bodies, ternaries, or memoized callbacks. The warning explains that JSX in hooks breaks the hook/component separation and suggests moving the markup into a component while keeping the hook focused on data and behavior.

The annotation check accepts `ReactNode`, `ReactElement` and `JSX.Element`, each with or without a `React.` qualifier — `React.ReactNode` and `React.JSX.Element` are the same types and are reported the same way. Only `React.` is treated as a qualifier for these names: `Foo.ReactNode` refers to another module's type and is left alone.

### Examples of incorrect code for this rule:

```tsx
const useHeader = () => {
  return <header>App Header</header>;
};
```

```tsx
function useNavigation(): React.ReactNode {
  return buildNavigation();
}
```

```tsx
function useLivestreamPlayer({ playbackId }: Props) {
  return useMemo(() => <Player id={playbackId} />, [playbackId]);
}
```

### Examples of correct code for this rule:

```tsx
const useHeaderProps = () => {
  const title = useTitle();
  return { title };
};

const Header = () => {
  const { title } = useHeaderProps();
  return <header>{title}</header>;
};
```

```tsx
function useLivestreamPlayerProps({ playbackId }: Props) {
  const content = useMemo(() => buildSlides(playbackId), [playbackId]);
  return { content };
}

const LivestreamPlayer = (props: Props) => {
  const { content } = useLivestreamPlayerProps(props);
  return <ContentCarousel items={content} />;
};
```
