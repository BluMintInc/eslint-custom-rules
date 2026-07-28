/**
 * Fixture for issue #1316: TypeScript overload signatures precede the real
 * implementation, which DOES take props. Reading the first `function
 * OverloadedChild(` in the file finds a zero-parameter overload signature and
 * wrongly concludes the component takes no props.
 */
export type OverloadedChildProps = Readonly<{
  value: string;
}>;

export function OverloadedChild(): JSX.Element;
export function OverloadedChild(props: OverloadedChildProps): JSX.Element;
export function OverloadedChild(props?: OverloadedChildProps) {
  return <div>{props?.value}</div>;
}
