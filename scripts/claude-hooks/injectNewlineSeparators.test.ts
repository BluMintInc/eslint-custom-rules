import { parse } from 'shell-quote';
import { injectNewlineSeparators } from './injectNewlineSeparators';

describe('injectNewlineSeparators', () => {
  /**
   * `shell-quote` swallows a bare newline exactly like whitespace, so without
   * the substitution `npm run build\nnpx jest` and
   * `npm run build npx jest` tokenize identically, with no trace of where the
   * boundary was — and the second command is absorbed into the first's
   * arguments.
   */
  it.each([['\n'], ['\r\n'], ['\r']])(
    'turns the %j boundary into an operator shell-quote can see',
    (newline) => {
      expect(
        parse(injectNewlineSeparators(`npm run build${newline}npx jest`)),
      ).toContainEqual({ op: ';' });
    },
  );

  /**
   * A backslash-newline is a line CONTINUATION: bash joins the two physical
   * lines and the command reads as one, so substituting it would leave an
   * escaped `;` standing where the next token belongs.
   */
  it('joins a continuation rather than splitting on it', () => {
    expect(injectNewlineSeparators('npx jest \\\n--bail')).toBe(
      'npx jest --bail',
    );
  });

  /** An EVEN backslash run is literal backslashes followed by a genuine
   * newline, which stays a boundary — reading it as a continuation would
   * swallow the boundary this function exists to preserve. */
  it('keeps the boundary after a doubled backslash', () => {
    expect(injectNewlineSeparators('npx jest \\\\\nnpm test')).toBe(
      'npx jest \\\\;npm test',
    );
  });

  it('leaves a command carrying no newline untouched', () => {
    expect(injectNewlineSeparators('npx jest --bail')).toBe('npx jest --bail');
  });
});
