import { ruleTesterTs } from '../utils/ruleTester';
import { noRedundantParamTypes } from '../rules/no-redundant-param-types';

const redundantParamData = (paramText: string) => ({ paramText });

ruleTesterTs.run('no-redundant-param-types', noRedundantParamTypes, {
  valid: [
    // Arrow function without type annotations
    {
      code: 'const fn = (x) => x;',
    },
    // Arrow function with type annotation only on variable
    {
      code: `
        const fn: (x: number) => number = (x) => x;
      `,
    },
    // Anonymous function passed as argument
    {
      code: `
        documentQuery.filter((doc: DocumentSnapshot) => doc.exists);
      `,
    },
    // Function without variable type annotation
    {
      code: `
        const process = (value: number) => value * 2;
      `,
    },
    // Generic function with type parameters but no redundant param types
    {
      code: `
        const fetchData: <T>(id: string) => Promise<T> = async <T>(id) => {
          return await apiCall(id);
        };
      `,
    },
    // Different parameter names but same types
    {
      code: `
        const fn: (x: number) => number = (y) => y;
      `,
    },
    // Rest parameters
    {
      code: `
        const sum: (...nums: number[]) => number = (...args) => args.reduce((a, b) => a + b, 0);
      `,
    },
    // Optional parameters
    {
      code: `
        const greet: (name?: string) => string = (name) => \`Hello \${name ?? 'world'}\`;
      `,
    },
    // Default values
    {
      code: `
        const multiply: (x: number, factor?: number) => number = (x, factor = 2) => x * factor;
      `,
    },
    // Destructured parameters
    {
      code: `
        const process: ({ x, y }: { x: number; y: string }) => string = ({ x, y }) => \`\${x}-\${y}\`;
      `,
    },
    // Union/intersection types
    {
      code: `
        const process: (value: string | number & { length: number }) => string = (value) => String(value);
      `,
    },
    // Type parameters in different positions
    {
      code: `
        const map: <T, U>(arr: T[], fn: (item: T) => U) => U[] = <T, U>(arr, fn) => arr.map(fn);
      `,
    },
    // Overloaded signatures
    {
      code: `
        interface Overloaded {
          (x: number): number;
          (x: string): string;
        }
        const fn: Overloaded = (x) => x;
      `,
    },
    // Callback parameters
    {
      code: `
        const withCallback: (cb: (err: Error | null, data?: string) => void) => void = (cb) => cb(null, 'data');
      `,
    },
    // Readonly parameters
    {
      code: `
        const process: (data: readonly string[]) => string[] = (data) => [...data];
      `,
    },
    // Tuple types
    {
      code: `
        const swap: (tuple: [string, number]) => [number, string] = (tuple) => [tuple[1], tuple[0]];
      `,
    },
  ],
  invalid: [
    // Basic case with single parameter
    {
      code: `
        const fn: (x: number) => number = (x: number) => x;
      `,
      output: `
        const fn: (x: number) => number = (x) => x;
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('x: number'),
        },
      ],
    },
    // Multiple parameters
    {
      code: `
        const example: (x: number, y: string) => void = (x: number, y: string) => {};
      `,
      output: `
        const example: (x: number, y: string) => void = (x, y) => {};
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('x: number'),
        },
        {
          messageId: 'redundantParamType',
          data: redundantParamData('y: string'),
        },
      ],
    },
    // Complex type with redundant parameter type
    {
      code: `
        export const enforceMembershipLimit: DocumentChangeHandler<
          ChannelMembership,
          ChannelMembershipPath
        > = async (
          event: FirestoreEvent<Change<DocumentSnapshot<ChannelMembership>>>,
        ) => {
          // function logic
        };
      `,
      output: `
        export const enforceMembershipLimit: DocumentChangeHandler<
          ChannelMembership,
          ChannelMembershipPath
        > = async (
          event,
        ) => {
          // function logic
        };
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData(
            'event: FirestoreEvent<Change<DocumentSnapshot<ChannelMembership>>>',
          ),
        },
      ],
    },
    // Generic function with redundant parameter type
    {
      code: `
        const fetchData: <T>(id: string) => Promise<T> = async <T>(id: string): Promise<T> => {
          return await apiCall(id);
        };
      `,
      output: `
        const fetchData: <T>(id: string) => Promise<T> = async <T>(id): Promise<T> => {
          return await apiCall(id);
        };
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('id: string'),
        },
      ],
    },
    // Rest parameters with redundant type
    {
      code: `
        const sum: (...nums: number[]) => number = (...nums: number[]) => nums.reduce((a, b) => a + b, 0);
      `,
      output: `
        const sum: (...nums: number[]) => number = (...nums) => nums.reduce((a, b) => a + b, 0);
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('...nums: number[]'),
        },
      ],
    },
    // Optional parameters with redundant type
    {
      code: `
        const greet: (name?: string) => string = (name?: string) => \`Hello \${name ?? 'world'}\`;
      `,
      output: `
        const greet: (name?: string) => string = (name) => \`Hello \${name ?? 'world'}\`;
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('name?: string'),
        },
      ],
    },
    // Destructured parameters with redundant type
    {
      code: `
        const process: ({ x, y }: { x: number; y: string }) => string = ({ x, y }: { x: number; y: string }) => \`\${x}-\${y}\`;
      `,
      output: `
        const process: ({ x, y }: { x: number; y: string }) => string = ({ x, y }) => \`\${x}-\${y}\`;
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('{ x, y }: { x: number; y: string }'),
        },
      ],
    },
    // Union/intersection types with redundant type
    {
      code: `
        const process: (value: string | number) => string = (value: string | number) => String(value);
      `,
      output: `
        const process: (value: string | number) => string = (value) => String(value);
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('value: string | number'),
        },
      ],
    },
    // Callback parameters with redundant type
    {
      code: `
        const withCallback: (cb: (err: Error | null) => void) => void = (cb: (err: Error | null) => void) => cb(null);
      `,
      output: `
        const withCallback: (cb: (err: Error | null) => void) => void = (cb) => cb(null);
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('cb: (err: Error | null) => void'),
        },
      ],
    },
    // Readonly parameters with redundant type
    {
      code: `
        const process: (data: readonly string[]) => string[] = (data: readonly string[]) => [...data];
      `,
      output: `
        const process: (data: readonly string[]) => string[] = (data) => [...data];
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('data: readonly string[]'),
        },
      ],
    },
    // Tuple types with redundant type
    {
      code: `
        const swap: (tuple: [string, number]) => [number, string] = (tuple: [string, number]) => [tuple[1], tuple[0]];
      `,
      output: `
        const swap: (tuple: [string, number]) => [number, string] = (tuple) => [tuple[1], tuple[0]];
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('tuple: [string, number]'),
        },
      ],
    },
    // Class method with redundant parameter type
    {
      code: `
        class Example {
          process: (value: number) => string = (value: number) => String(value);
        }
      `,
      output: `
        class Example {
          process: (value: number) => string = (value) => String(value);
        }
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('value: number'),
        },
      ],
    },
    // Interface implementation with redundant parameter type
    {
      code: `
        interface Handler {
          handle: (event: Event) => void;
        }
        class MyHandler implements Handler {
          handle: (event: Event) => void = (event: Event) => { console.log(event); };
        }
      `,
      output: `
        interface Handler {
          handle: (event: Event) => void;
        }
        class MyHandler implements Handler {
          handle: (event: Event) => void = (event) => { console.log(event); };
        }
      `,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('event: Event'),
        },
      ],
    },
  ],
});
