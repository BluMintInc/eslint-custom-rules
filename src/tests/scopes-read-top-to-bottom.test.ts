import { ruleTesterTs } from '../utils/ruleTester';
import { scopesReadTopToBottom } from '../rules/scopes-read-top-to-bottom';

ruleTesterTs.run('scopes-read-top-to-bottom', scopesReadTopToBottom, {
  valid: [
    {
      code: `
        const a = 1;
        const b = a + 2;
      `,
    },
    {
      code: `
        const [state, setState] = useState(null);
        const value = state + 1;
      `,
    },
  ],
  invalid: [
    {
      code: `
        const b = a + 2;
        const a = 1;
      `,
      errors: [{ messageId: 'scopesReadTopToBottom' }],
    },
  ],
});
