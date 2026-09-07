/** Whether `token` names `option`, in either the bare or `=`-joined spelling. */
export function namesOption(token: string, option: string) {
  return readOptionName(token) === option;
}

/**
 * The NAME half of an argv token — `--reporters` from `--reporters=x`, and the
 * token itself when it carries no value.
 *
 * Stripping the `=`-joined value HERE is what lets every flag registry in this
 * tier be a `Set` read by exact membership, rather than a list each lookup
 * scans for a prefix match.
 */
export function readOptionName(token: string) {
  const equalsIndex = token.indexOf('=');
  return equalsIndex === -1 ? token : token.slice(0, equalsIndex);
}
