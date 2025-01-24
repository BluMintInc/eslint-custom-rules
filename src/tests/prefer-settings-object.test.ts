import { ruleTesterTs } from '../utils/ruleTester';
import { preferSettingsObject } from '../rules/prefer-settings-object';

ruleTesterTs.run('prefer-settings-object', preferSettingsObject, {
  valid: [
    // Functions with less than 3 parameters
    {
      code: `function twoParams(a: string, b: number) { return a + b; }`,
    },
    {
      code: `const arrowFn = (a: string, b: number) => a + b;`,
    },
    // Functions with different types
    {
      code: `function diffTypes(a: string, b: number) { return a + b; }`,
      options: [{ checkSameTypeParameters: true }],
    },
    // Ignored variadic functions
    {
      code: `function sum(...numbers: number[]) { return numbers.reduce((a, b) => a + b, 0); }`,
      options: [{ ignoreVariadicFunctions: true }],
    },
    // Ignored bound methods
    {
      code: `app.get('/user', (req: Request, res: Response, next: NextFunction) => {});`,
      options: [{ ignoreBoundMethods: true }],
    },
    // Already using settings object
    {
      code: `
        type Settings = { name: string; age: number; isAdmin: boolean; };
        function createUser({ name, age, isAdmin }: Settings) { return { name, age, isAdmin }; }
      `,
    },
  ],
  invalid: [
    // Too many parameters
    {
      code: `function createUser(name: string, age: number, isAdmin: boolean) { return { name, age, isAdmin }; }`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    {
      code: `const createUser = (name: string, age: number, isAdmin: boolean) => ({ name, age, isAdmin });`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    // Same type parameters
    {
      code: `function sendEmail(to: string, from: string) { console.log(to, from); }`,
      options: [{ checkSameTypeParameters: true }],
      errors: [{ messageId: 'sameTypeParams' }],
    },
    // Method signatures
    {
      code: `
        interface UserService {
          createUser(name: string, age: number, isAdmin: boolean): void;
        }
      `,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    // Function types
    {
      code: `type CreateUser = (name: string, age: number, isAdmin: boolean) => void;`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    // Default parameters
    {
      code: `function configureServer(port: number = 8080, hostname: string = 'localhost', ssl: boolean = false) {}`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
  ],
});
