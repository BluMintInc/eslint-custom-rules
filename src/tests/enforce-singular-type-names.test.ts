import { enforceSingularTypeNames } from '../rules/enforce-singular-type-names';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('enforce-singular-type-names', enforceSingularTypeNames, {
  valid: [
    // Singular type alias
    'type User = { id: number; name: string; };',

    // Singular interface
    'interface Person { id: number; name: string; }',

    // Singular enum
    'enum Color { RED, GREEN, BLUE }',

    // Already singular according to pluralize
    'type Analysis = { result: string; };',

    // Short names (less than 3 characters)
    'type ID = string;',

    // Union type with singular name
    'type Status = "pending" | "completed" | "failed";',

    // Generic type with singular name
    'type Result<T> = { data: T; error?: string; };',

    // Type with irregular plural that's already singular
    'type Sheep = { wool: boolean; };',
  ],
  invalid: [
    // Plural type alias
    {
      code: 'type Users = { id: number; name: string; };',
      errors: [
        {
          messageId: 'typeShouldBeSingular',
          data: { name: 'Users', suggestedName: 'User' },
        },
      ],
    },

    // Plural interface
    {
      code: 'interface People { id: number; name: string; }',
      errors: [
        {
          messageId: 'typeShouldBeSingular',
          data: { name: 'People', suggestedName: 'Person' },
        },
      ],
    },

    // Plural enum
    {
      code: 'enum Colors { RED, GREEN, BLUE }',
      errors: [
        {
          messageId: 'typeShouldBeSingular',
          data: { name: 'Colors', suggestedName: 'Color' },
        },
      ],
    },

    // Plural union type
    {
      code: 'type Phases = "not-ready" | "ready";',
      errors: [
        {
          messageId: 'typeShouldBeSingular',
          data: { name: 'Phases', suggestedName: 'Phase' },
        },
      ],
    },

    // Plural generic type
    {
      code: 'type Results<T> = { data: T; error?: string; };',
      errors: [
        {
          messageId: 'typeShouldBeSingular',
          data: { name: 'Results', suggestedName: 'Result' },
        },
      ],
    },

    // Irregular plural
    {
      code: 'type Children = { name: string; age: number; };',
      errors: [
        {
          messageId: 'typeShouldBeSingular',
          data: { name: 'Children', suggestedName: 'Child' },
        },
      ],
    },
  ],
});
