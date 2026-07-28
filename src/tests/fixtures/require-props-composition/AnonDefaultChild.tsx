/**
 * Fixture for issue #1316: an ANONYMOUS default-exported function declaration.
 * The default export is the function itself rather than an alias or a wrapper
 * call, and it declares no parameters, so the child really is prop-less.
 */
export default function () {
  return <div />;
}
