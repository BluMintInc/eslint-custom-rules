/**
 * Fixture for issue #1316: a nested template literal holds text that reads as a
 * zero-argument declaration of this very component, ahead of the real one. The
 * component itself DOES take props; only a real parse tells the string apart
 * from a declaration.
 */
const SNIPPET = `outer ${`const TemplateTrapChild = () => null;`} tail`;

export type TemplateTrapChildProps = Readonly<{
  value: string;
}>;

export const TemplateTrapChild = ({ value }: TemplateTrapChildProps) => {
  return (
    <div>
      {value}
      {SNIPPET}
    </div>
  );
};
