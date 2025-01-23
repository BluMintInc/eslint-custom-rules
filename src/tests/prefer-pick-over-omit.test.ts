import { ruleTesterTs } from '../utils/ruleTester';
import { preferPickOverOmit } from '../rules/prefer-pick-over-omit';

ruleTesterTs.run('prefer-pick-over-omit', preferPickOverOmit, {
  valid: [
    // Allow Pick usage
    {
      code: `
        type User = {
          id: string;
          name: string;
          email: string;
          age: number;
        };
        type PublicUser = Pick<User, 'id' | 'name'>;
      `,
    },
    // Allow Omit in generic utility types
    {
      code: `
        type WithoutId<T> = Omit<T, 'id'>;
      `,
    },
    // Allow Omit with computed/dynamic keys
    {
      code: `
        type Keys = 'email' | 'age';
        type PublicUser = Omit<User, Keys>;
      `,
    },
  ],
  invalid: [
    // Basic case
    {
      code: `
        type User = {
          id: string;
          name: string;
          email: string;
          age: number;
        };
        type PublicUser = Omit<User, 'email' | 'age'>;
      `,
      errors: [{ messageId: 'preferPickOverOmit' }],
      output: `
        type User = {
          id: string;
          name: string;
          email: string;
          age: number;
        };
        type PublicUser = Pick<User, Exclude<keyof User, 'email' | 'age'>>;
      `,
    },
    // Single property omission
    {
      code: `
        type User = {
          id: string;
          name: string;
          email: string;
        };
        type PublicUser = Omit<User, 'email'>;
      `,
      errors: [{ messageId: 'preferPickOverOmit' }],
      output: `
        type User = {
          id: string;
          name: string;
          email: string;
        };
        type PublicUser = Pick<User, Exclude<keyof User, 'email'>>;
      `,
    },
    // In function return type
    {
      code: `
        function getPublicUser(): Omit<User, 'email'> {
          return { id: '1', name: 'John' };
        }
      `,
      errors: [{ messageId: 'preferPickOverOmit' }],
      output: `
        function getPublicUser(): Pick<User, Exclude<keyof User, 'email'>> {
          return { id: '1', name: 'John' };
        }
      `,
    },
    // In React component props
    {
      code: `
        interface Props extends Omit<User, 'email' | 'age'> {
          extraProp: string;
        }
      `,
      errors: [{ messageId: 'preferPickOverOmit' }],
      output: `
        interface Props extends Pick<User, Exclude<keyof User, 'email' | 'age'>> {
          extraProp: string;
        }
      `,
    },
  ],
});
