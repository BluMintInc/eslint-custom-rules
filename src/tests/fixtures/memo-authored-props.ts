/**
 * An authored base props type in a plain `.ts` module, so
 * `memo-compare-deeply-complex-props` can prove its library carve-out keys on
 * the declaration FILE rather than on "the prop arrived from another module".
 */
export type AuthoredBaseProps = {
  settings: Record<string, string>;
};
