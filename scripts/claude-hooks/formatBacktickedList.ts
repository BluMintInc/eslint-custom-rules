/**
 * A deny reason's list of offending values, backticked and comma-joined with a
 * trailing `and`.
 *
 * Shared across the `PreToolUse:Bash` guards because one list grammar
 * maintained in two directories lands a change on one deny channel only. Every
 * value is named wherever this is used, for the same reason in each: a remedy
 * naming one of several, followed exactly, still breaks the rest — while
 * reading as complete.
 *
 * The head is a separate parameter rather than the array's first element, so no
 * branch exists for an element the caller has already proved present. Callers
 * destructure and own their own loud refusal of an empty list.
 */
export function formatBacktickedList(first: string, rest: readonly string[]) {
  return rest.reduce((joined, value, index) => {
    const separator = index === rest.length - 1 ? ' and ' : ', ';
    return `${joined}${separator}\`${value}\``;
  }, `\`${first}\``);
}
