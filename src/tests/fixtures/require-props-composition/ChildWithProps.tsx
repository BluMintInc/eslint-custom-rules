/**
 * Fixture: a relatively-imported child that DOES take props. It has a real
 * customization surface, so it stays a composition dependency.
 */
export type ChildWithPropsProps = Readonly<{
  value: string;
}>;

export const ChildWithProps = ({ value }: ChildWithPropsProps) => {
  return <div>{value}</div>;
};
