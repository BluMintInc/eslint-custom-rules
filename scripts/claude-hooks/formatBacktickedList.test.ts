import { formatBacktickedList } from './formatBacktickedList';

describe('formatBacktickedList', () => {
  it('backticks a lone value', () => {
    expect(formatBacktickedList('CI', [])).toBe('`CI`');
  });

  it('joins a pair with `and`', () => {
    expect(formatBacktickedList('CI', ['BLUMINT_GOVERNOR_CLI'])).toBe(
      '`CI` and `BLUMINT_GOVERNOR_CLI`',
    );
  });

  /** Every value is named wherever this is used: a remedy naming one of
   * several, followed exactly, still breaks the rest — while reading as
   * complete. */
  it('commas the head of a longer list and `and`s the tail', () => {
    expect(formatBacktickedList('/c/one', ['/c/two', '/c/three'])).toBe(
      '`/c/one`, `/c/two` and `/c/three`',
    );
  });
});
