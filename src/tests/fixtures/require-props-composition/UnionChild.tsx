/**
 * Fixture: a relatively-imported child whose props are a discriminated union
 * (issue #1709). Composing with the exported chip member composes with the
 * child's surface just as composing with the union alias does, so the parent
 * has to resolve this module to see the members.
 */
type UnionChildSwitchProps = Readonly<{
  variant?: 'switch';
  label: string;
}>;

export type UnionChildChipProps = Readonly<{
  variant: 'chip';
  label: string;
}>;

export type UnionChildProps = UnionChildSwitchProps | UnionChildChipProps;

export const UnionChild = (props: UnionChildProps) => {
  return <div>{props.label}</div>;
};

/**
 * A sibling export whose props are NOT a union: nothing here can be credited as
 * a union member, so a parent composing with an unrelated type still reports.
 */
export type SoloChildProps = Readonly<{
  label: string;
}>;

export const SoloChild = ({ label }: SoloChildProps) => {
  return <div>{label}</div>;
};
