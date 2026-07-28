/**
 * Fixture for issue #1316: the exported component takes props, but a same-named
 * zero-argument function is declared in a NESTED scope further down the file.
 * A scope-blind search finds the nested declaration and wrongly drops the child
 * from the dependency set.
 */
export type NestedShadowChildProps = Readonly<{
  value: string;
}>;

export const NestedShadowChild = ({ value }: NestedShadowChildProps) => {
  return <div>{value}</div>;
};

export function useShadowedFallback() {
  function NestedShadowChild() {
    return null;
  }
  return NestedShadowChild;
}
