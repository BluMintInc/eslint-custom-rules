/**
 * Fixture for issue #1316: a genuinely zero-prop child whose body holds an
 * apostrophe in JSX text and a regex literal containing a quote. Both read as an
 * unterminated string to a character scan, which then blanks the rest of the
 * file and loses the zero-prop proof on the very files this relaxation targets.
 */
const APOSTROPHE = /'/g;

export const ApostropheChild = () => {
  const label = "Don't".replace(APOSTROPHE, '');
  return (
    <div>
      <h2>Don't panic</h2>
      {label}
    </div>
  );
};
