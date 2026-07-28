/**
 * Fixture for issue #1316: `export default <Identifier>` where the identifier
 * resolves to a component that TAKES props. Following the alias must report the
 * real parameter list, so the child stays a composition dependency.
 */
export type DefaultAliasPropsChildProps = Readonly<{
  value: string;
}>;

const DefaultAliasPropsChildUnmemoized = ({
  value,
}: DefaultAliasPropsChildProps) => {
  return <div>{value}</div>;
};

export default DefaultAliasPropsChildUnmemoized;
