import { Linter, Rule } from 'eslint';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterTs } from '../utils/ruleTester';
import { noRedundantParamTypes } from '../rules/no-redundant-param-types';

const redundantParamData = (paramText: string) => ({ paramText });

/**
 * Type names the source references but no longer binds.
 *
 * This is the failure a fix that deletes an import too eagerly produces, and it
 * is invisible to the rule's own reports — the fix resolves them, so nothing
 * re-reports the damage. It is also strictly worse than the unused import issue
 * #1653 reports: an unused import is a lint warning, a type reference bound to
 * nothing is a compile error.
 */
function danglingTypeReferences(code: string): string[] {
  const ast = tsParser.parse(code, {
    ecmaVersion: 2022,
    sourceType: 'module',
    range: true,
    loc: true,
  });

  const bound = new Set<string>();
  const used = new Set<string>();

  const visit = (node: TSESTree.Node): void => {
    if (node.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const specifier of node.specifiers) {
        bound.add(specifier.local.name);
      }
      return;
    }
    if (
      node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
      node.type === AST_NODE_TYPES.TSInterfaceDeclaration
    ) {
      bound.add(node.id.name);
    }
    if (
      node.type === AST_NODE_TYPES.TSTypeReference &&
      node.typeName.type === AST_NODE_TYPES.Identifier
    ) {
      used.add(node.typeName.name);
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child === 'object' && 'type' in child) {
          visit(child as TSESTree.Node);
        }
      }
    }
  };

  visit(ast as TSESTree.Node);
  return [...used].filter((name) => !bound.has(name));
}

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
    // No contextual type, so the annotation is load-bearing and the import it
    // consumes is never in question
    {
      code: `import { Payload } from './payload';

export const run = (payload: Payload) => payload;
`,
    },
    // An empty parameter list has nothing to strip, so no import moves either
    {
      code: `import { Handler } from './handler';

export const run: Handler = () => null;
`,
    },
    // Parameters already relying on the contextual type
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

const SEED: Payload = { id: 'seed' };

export const run: Handler = (payload) => ({ ...payload, ...SEED });
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

    // Issue #1653: a parameter annotation can be the only consumer of the types
    // it names. Stripping it on its own leaves those imports bound to nothing,
    // so a file that linted clean fails `no-unused-vars` afterwards — and since
    // the rule's own report is resolved by the fix, nothing re-reports the debt.
    // The imports therefore go with the annotation, as one atomic fix.

    // The issue's reproduction: a v2 Firebase change handler whose parameter
    // annotation is the sole consumer of three imports, while the type the
    // handler is declared with keeps its own imports alive
    {
      code: `import { Change } from 'firebase-functions/v2';
import { DatabaseEvent } from 'firebase-functions/v2/database';
import { DataSnapshot } from '../types/DataSnapshot';
import { RealtimeDbChangeHandler } from '../v2/handlerTypes';
import { CallerCount, CallerCountPath } from '../types/CallerCount';

export const closeRoom: RealtimeDbChangeHandler<
  CallerCount,
  CallerCountPath
> = async (event: DatabaseEvent<Change<DataSnapshot<CallerCount>>>) => {
  console.log(event);
};
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData(
            'event: DatabaseEvent<Change<DataSnapshot<CallerCount>>>',
          ),
        },
      ],
      output: `import { RealtimeDbChangeHandler } from '../v2/handlerTypes';
import { CallerCount, CallerCountPath } from '../types/CallerCount';

export const closeRoom: RealtimeDbChangeHandler<
  CallerCount,
  CallerCountPath
> = async (event) => {
  console.log(event);
};
`,
    },

    // A sole-consumer import goes with the annotation, declaration and all
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // Control: a type used elsewhere too keeps its import, so the fix is
    // corrected rather than switched off
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

const SEED: Payload = { id: 'seed' };

export const run: Handler = (payload: Payload) => ({ ...payload, ...SEED });
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import { Payload } from './payload';

const SEED: Payload = { id: 'seed' };

export const run: Handler = (payload) => ({ ...payload, ...SEED });
`,
    },

    // Multiple specifiers: only the orphaned one goes, siblings stay
    {
      code: `import { Handler, Payload, Result } from './types';

export const RESULT: Result = { ok: true };

export const run: Handler = (payload: Payload) => RESULT;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler, Result } from './types';

export const RESULT: Result = { ok: true };

export const run: Handler = (payload) => RESULT;
`,
    },

    // The orphan ending the list gives up the comma before it
    {
      code: `import { Handler, Payload } from './types';

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './types';

export const run: Handler = (payload) => payload;
`,
    },

    // A multi-line specifier list keeps its layout
    {
      code: `import {
  Handler,
  Payload,
} from './types';

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import {
  Handler,
} from './types';

export const run: Handler = (payload) => payload;
`,
    },

    // Every specifier of a declaration orphaned by one annotation: the
    // declaration goes rather than becoming \`import {} from './types';\`
    {
      code: `import { Handler } from './handler';
import { Payload, Meta } from './types';

export const run: Handler = (payload: Payload & Meta) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload & Meta'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // A type-only import is unbound the same way
    {
      code: `import type { Handler } from './handler';
import type { Payload } from './payload';

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import type { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // An inline \`type\` specifier alongside a value specifier that survives
    {
      code: `import { Handler } from './handler';
import { type Payload, buildPayload } from './payload';

export const run: Handler = (payload: Payload) => buildPayload(payload);
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import { buildPayload } from './payload';

export const run: Handler = (payload) => buildPayload(payload);
`,
    },

    // An aliased specifier is bound by its local name
    {
      code: `import { Handler } from './handler';
import { Payload as PayloadModel } from './payload';

export const run: Handler = (payload: PayloadModel) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: PayloadModel'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // A default import used only as an annotation
    {
      code: `import { Handler } from './handler';
import Payload from './payload';

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // A default import whose sibling named specifier survives keeps the
    // declaration and loses only its own clause
    {
      code: `import { Handler } from './handler';
import Payload, { build } from './payload';

export const run: Handler = (payload: Payload) => build(payload);
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import { build } from './payload';

export const run: Handler = (payload) => build(payload);
`,
    },

    // Losing the last named specifier takes the braces with it
    {
      code: `import { Handler } from './handler';
import Client, { type Payload } from './payload';

export const run: Handler = (payload: Payload) => Client.send(payload);
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import Client from './payload';

export const run: Handler = (payload) => Client.send(payload);
`,
    },

    // A namespace import reached only through a qualified type name
    {
      code: `import { Handler } from './handler';
import * as Api from './api';

export const run: Handler = (payload: Api.Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Api.Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // A namespace import still used for a value stays put
    {
      code: `import { Handler } from './handler';
import * as Api from './api';

export const run: Handler = (payload: Api.Payload) => Api.send(payload);
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Api.Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import * as Api from './api';

export const run: Handler = (payload) => Api.send(payload);
`,
    },

    // An import used as a value keeps its binding
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = (payload: Payload) => new Payload(payload);
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = (payload) => new Payload(payload);
`,
    },

    // A re-exported binding keeps its import: the export is a consumer the
    // deleted annotation says nothing about
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export type { Payload };

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import { Payload } from './payload';

export type { Payload };

export const run: Handler = (payload) => payload;
`,
    },

    // A second annotation elsewhere in the file is a surviving consumer, so the
    // import stays even though this annotation goes
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

const parse = (raw: string): Payload => JSON.parse(raw);

export const run: Handler = (payload: Payload) => parse(String(payload));
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';
import { Payload } from './payload';

const parse = (raw: string): Payload => JSON.parse(raw);

export const run: Handler = (payload) => parse(String(payload));
`,
    },

    // An overload set naming the type is likewise a surviving consumer
    {
      code: `import { Payload } from './payload';

interface Overloaded {
  (value: Payload): Payload;
  (value: string): string;
}

const fn: Overloaded = (value: Payload) => value;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('value: Payload'),
        },
      ],
      output: `import { Payload } from './payload';

interface Overloaded {
  (value: Payload): Payload;
  (value: string): string;
}

const fn: Overloaded = (value) => value;
`,
    },

    // A rest parameter carries its annotation the same way
    {
      code: `import { Handler } from './handler';
import { Item } from './item';

export const collect: Handler = (...items: Item[]) => items;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('...items: Item[]'),
        },
      ],
      output: `import { Handler } from './handler';

export const collect: Handler = (...items) => items;
`,
    },

    // An optional parameter loses its \`?\` along with the annotation and the
    // import behind it
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = (payload?: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload?: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // A destructured parameter
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = ({ id }: Payload) => id;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('{ id }: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = ({ id }) => id;
`,
    },

    // An array pattern parameter
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = ([first]: Payload[]) => first;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('[first]: Payload[]'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = ([first]) => first;
`,
    },

    // A parameter with a default value keeps the default and loses the import
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = (payload: Payload = { id: '' }) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData("payload: Payload = { id: '' }"),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload = { id: '' }) => payload;
`,
    },

    // A class property assignment reaches the same fixer
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export class Runner {
  run: Handler = (payload: Payload) => payload;
}
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export class Runner {
  run: Handler = (payload) => payload;
}
`,
    },

    // A comment trailing the import on its own line describes the import, so it
    // goes with it rather than being stranded
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload'; // the stored shape

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },

    // Declining the whole fix beats emitting half of it. Each case below would
    // orphan a binding that cannot be unbound cleanly, so the annotation stays
    // too and the report carries no fixer.

    // A directive bound to the import's line would outlive its subject
    {
      code: `import { Handler } from './handler';
// eslint-disable-next-line no-unused-vars
import { Payload } from './payload';

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: null,
    },

    // A comment among the specifiers would be swallowed by the separator surgery
    {
      code: `import { Handler } from './handler';
import { /* keep */ Payload, Meta } from './types';

export const META: Meta = {};

export const run: Handler = (payload: Payload) => META;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: null,
    },

    // A shadowing binding of the same name means the two views of "is it still
    // used" disagree, and an unprovable deletion is not attempted
    {
      code: `import { Handler } from './handler';
import { Payload } from './payload';

export const run: Handler = (payload: Payload) => payload;
export const nameOf = (Payload: string) => Payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: null,
    },

    // A local type alias cannot be unbound by dropping an import specifier, so
    // an annotation that is its only consumer keeps it company
    {
      code: `import { Handler } from './handler';

type Payload = { id: string };

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: null,
    },

    // An exported local type has a consumer outside the file, so the annotation
    // still goes
    {
      code: `import { Handler } from './handler';

export type Payload = { id: string };

export const run: Handler = (payload: Payload) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

export type Payload = { id: string };

export const run: Handler = (payload) => payload;
`,
    },

    // A local type used elsewhere too is not orphaned by the strip
    {
      code: `import { Handler } from './handler';

type Payload = { id: string };

const SEED: Payload = { id: 'seed' };

export const run: Handler = (payload: Payload) => ({ ...payload, ...SEED });
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: Payload'),
        },
      ],
      output: `import { Handler } from './handler';

type Payload = { id: string };

const SEED: Payload = { id: 'seed' };

export const run: Handler = (payload) => ({ ...payload, ...SEED });
`,
    },

    // A \`typeof\` query against a local const is the one orphan shape that slips
    // through: the declaration's own initializer counts as a reference, so the
    // binding never looks unreferenced and the strip goes ahead, leaving
    // \`SHAPE\` unused. The boundary is pinned here rather than left to be
    // rediscovered — closing it means teaching the shared helper to discount a
    // declaration's self-write, which is a change to every rule that unbinds.
    {
      code: `import { Handler } from './handler';

const SHAPE = { id: '' };

export const run: Handler = (payload: typeof SHAPE) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: typeof SHAPE'),
        },
      ],
      output: `import { Handler } from './handler';

const SHAPE = { id: '' };

export const run: Handler = (payload) => payload;
`,
    },

    // The same query against a const with other consumers strips cleanly
    {
      code: `import { Handler } from './handler';

const SHAPE = { id: '' };

export const run: Handler = (payload: typeof SHAPE) => ({ ...SHAPE, ...payload });
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: typeof SHAPE'),
        },
      ],
      output: `import { Handler } from './handler';

const SHAPE = { id: '' };

export const run: Handler = (payload) => ({ ...SHAPE, ...payload });
`,
    },

    // An import reached only through a \`typeof\` query is unbound like any other
    {
      code: `import { Handler } from './handler';
import { SHAPE } from './shape';

export const run: Handler = (payload: typeof SHAPE) => payload;
`,
      errors: [
        {
          messageId: 'redundantParamType',
          data: redundantParamData('payload: typeof SHAPE'),
        },
      ],
      output: `import { Handler } from './handler';

export const run: Handler = (payload) => payload;
`,
    },
  ],
});

// RuleTester applies one fix pass and never re-lints, so it cannot observe the
// consequence this fix exists to prevent (issue #1653): an import left bound to
// nothing after its only consumer — the parameter type annotation — is deleted.
// These drive the real `Linter` to a fixed point and re-lint the output with
// `no-unused-vars`.
describe('no-redundant-param-types --fix leaves no import bound to nothing', () => {
  const RULE_ID = '@blumintinc/blumint/no-redundant-param-types';
  const FILENAME = 'x.ts';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', tsParser as never);
    linter.defineRule(
      RULE_ID,
      noRedundantParamTypes as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  const FIX_RULES: Linter.RulesRecord = { [RULE_ID]: 'error' };
  const UNUSED_RULES: Linter.RulesRecord = { 'no-unused-vars': 'error' };

  // The issue's agora reproduction, trimmed to the shape that matters
  const REPRO = [
    "import { Change } from 'firebase-functions/v2';",
    "import { DatabaseEvent } from 'firebase-functions/v2/database';",
    "import { DataSnapshot } from '../types/DataSnapshot';",
    "import { RealtimeDbChangeHandler } from '../v2/handlerTypes';",
    "import { CallerCount, CallerCountPath } from '../types/CallerCount';",
    '',
    'export const closeRoom: RealtimeDbChangeHandler<',
    '  CallerCount,',
    '  CallerCountPath',
    '> = async (event: DatabaseEvent<Change<DataSnapshot<CallerCount>>>) => {',
    '  console.log(event);',
    '};',
    '',
  ].join('\n');

  // Without this the assertions below would hold for a rule that simply stopped
  // fixing, or for a `no-unused-vars` that never noticed a type-only import.
  it('reports unused bindings for the shape a bare annotation strip produces', () => {
    const stripped = REPRO.replace(
      '(event: DatabaseEvent<Change<DataSnapshot<CallerCount>>>)',
      '(event)',
    );
    const messages = makeLinter().verify(
      stripped,
      configFor(UNUSED_RULES),
      FILENAME,
    );
    expect(messages.map((message) => message.message)).toEqual([
      "'Change' is defined but never used.",
      "'DatabaseEvent' is defined but never used.",
      "'DataSnapshot' is defined but never used.",
    ]);
  });

  it('removes the annotation and every import it was the sole consumer of', () => {
    const linter = makeLinter();
    expect(
      linter.verify(REPRO, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(REPRO, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).toContain('> = async (event) => {');
    expect(fixed.output).not.toContain('firebase-functions/v2');
    expect(fixed.output).not.toContain('DataSnapshot');
    // The type the handler declaration still names keeps its import
    expect(fixed.output).toContain(
      "import { CallerCount, CallerCountPath } from '../types/CallerCount';",
    );
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
    expect(danglingTypeReferences(fixed.output)).toEqual([]);
  });

  // The mirror image: a binding with a consumer the fix does not touch keeps
  // its import, so the fix is corrected rather than switched off.
  it('keeps an import that survives the annotation', () => {
    const linter = makeLinter();
    const source = [
      "import { Handler } from './handler';",
      "import { Payload } from './payload';",
      '',
      "const SEED: Payload = { id: 'seed' };",
      '',
      'export const run: Handler = (payload: Payload) => ({ ...payload, ...SEED });',
      '',
    ].join('\n');

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).toContain("import { Payload } from './payload';");
    expect(fixed.output).not.toContain('(payload: Payload)');
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
  });

  // Several parameters of one signature each orphan their own import. The fixes
  // merge into ranges that span from each import to its annotation, so they
  // conflict and ESLint defers all but one per pass; the run still converges.
  it('unbinds every import across passes when each parameter orphans one', () => {
    const linter = makeLinter();
    const source = [
      "import { Handler } from './handler';",
      "import { Payload } from './payload';",
      "import { Meta } from './meta';",
      '',
      'export const run: Handler = (payload: Payload, meta: Meta) => [payload, meta];',
      '',
    ].join('\n');

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).toContain(
      'export const run: Handler = (payload, meta) => [payload, meta];',
    );
    expect(fixed.output).not.toContain('./payload');
    expect(fixed.output).not.toContain('./meta');
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
    expect(danglingTypeReferences(fixed.output)).toEqual([]);
  });

  // A type two strippable annotations share is deliberately NOT unbound. Each
  // fix is judged alone against the file as it stands, so neither annotation
  // sees itself as the last consumer, and ESLint applies both non-conflicting
  // strips in the same pass — leaving the import unused.
  //
  // That is the price of suppression safety, and it is the cheaper side of the
  // trade. Judging the fixes together would delete the import whenever a
  // sibling annotation turned out to be `eslint-disable`d (which a rule cannot
  // see), leaving a type reference bound to nothing: a compile error in place
  // of an unused-import warning. The suppression suite below pins that.
  it('leaves an import two annotations share rather than assuming both go', () => {
    const linter = makeLinter();
    const source = [
      "import { Handler } from './handler';",
      "import { Payload } from './payload';",
      '',
      'export const run: Handler = (payload: Payload) => payload;',
      'export const runAgain: Handler = (payload: Payload) => payload;',
      '',
    ].join('\n');

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).not.toContain('(payload: Payload)');
    expect(fixed.output).toContain("import { Payload } from './payload';");
    // The property that actually matters: nothing is left naming a type the
    // file no longer binds.
    expect(danglingTypeReferences(fixed.output)).toEqual([]);
  });
});

// A rule cannot see `eslint-disable`: suppression is applied to reports after
// they are emitted. So a fix may never assume that another report's fix also
// lands — a disabled sibling annotation keeps referencing the type forever, and
// deleting "its" import strands that reference. These pin every suppression
// shape against the real `Linter`, which is the only place the interaction
// exists: RuleTester bypasses directive processing entirely.
describe('no-redundant-param-types --fix under eslint-disable', () => {
  const RULE_ID = '@blumintinc/blumint/no-redundant-param-types';
  const FILENAME = 'x.ts';

  const fixWith = (code: string) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', tsParser as never);
    linter.defineRule(
      RULE_ID,
      noRedundantParamTypes as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' },
      },
      FILENAME,
    );
  };

  const IMPORTS = [
    "import { Handler } from './handler';",
    "import { Payload } from './payload';",
  ].join('\n');
  const annotated = (name: string) =>
    `export const ${name}: Handler = (payload: Payload) => payload;`;

  const expectNoDanglingType = (source: string, output: string) => {
    expect(danglingTypeReferences(source)).toEqual([]);
    expect(danglingTypeReferences(output)).toEqual([]);
  };

  it('strips both annotations and strands nothing when neither is disabled', () => {
    const source = `${IMPORTS}\n\n${annotated('a')}\n${annotated('b')}\n`;
    const { output } = fixWith(source);

    // Vacuity guard: a rule that stopped fixing would pass every assertion
    // about what the output does not contain.
    expect(output).not.toContain('(payload: Payload)');
    expectNoDanglingType(source, output);
  });

  it('keeps the import when a sibling annotation is disabled next-line', () => {
    const source = [
      IMPORTS,
      '',
      annotated('a'),
      `// eslint-disable-next-line ${RULE_ID}`,
      annotated('b'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain("import { Payload } from './payload';");
    expect(output).toContain('(payload: Payload)');
    expectNoDanglingType(source, output);
  });

  it('keeps the import when a sibling annotation is disabled by a block', () => {
    const source = [
      IMPORTS,
      '',
      annotated('a'),
      `/* eslint-disable ${RULE_ID} */`,
      annotated('b'),
      `/* eslint-enable ${RULE_ID} */`,
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain("import { Payload } from './payload';");
    expect(output).toContain('(payload: Payload)');
    expectNoDanglingType(source, output);
  });

  it('changes nothing when the sole consumer is itself disabled', () => {
    const source = [
      IMPORTS,
      '',
      `// eslint-disable-next-line ${RULE_ID}`,
      annotated('b'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toBe(source);
    expectNoDanglingType(source, output);
  });
});
