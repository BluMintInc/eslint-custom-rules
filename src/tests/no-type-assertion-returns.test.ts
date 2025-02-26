import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('no-type-assertion-returns', noTypeAssertionReturns, {
  valid: [
    // ==================== VARIABLE DECLARATION WITH TYPE ASSERTION ====================

    // Good: Variable declaration with type assertion using 'as' syntax (should not be flagged)
    `
    function getDocumentReference() {
      const tournamentRef = db.doc(
        toTournamentPath({ gameId, tournamentId }),
      ) as DocumentReference<Tournament>;
      return tournamentRef;
    }
    `,

    // Good: Variable declaration with type assertion using angle bracket syntax (should not be flagged)
    `
    function getDocumentReferenceAngleBracket() {
      const tournamentRef = <DocumentReference<Tournament>>db.doc(
        toTournamentPath({ gameId, tournamentId })
      );
      return tournamentRef;
    }
    `,

    // ==================== BASIC VALID CASES ====================

    // Good: Type the variable explicitly
    `
    function getGroupFilters() {
      const filters: TournamentGroupFilterParams = [...someFilters];
      return filters;
    }
    `,

    // Good: Construct with proper typing
    `
    function getSettings() {
      const settings: UserSettings = {
        theme: 'dark',
        notifications: true
      };
      return settings;
    }
    `,

    // Good: TypeScript will catch missing fields
    `
    function getPlayerStats() {
      const stats: PlayerStats = {
        wins: 10,
        losses: 5,
        rank: 'Gold'
      };
      return stats;
    }
    `,

    // Good: as const should be permitted
    {
      code: `
      function getTournamentConfig() {
        return {
          maxPlayers: 64,
          minPlayers: 2,
          roundDuration: 3600
        } as const;
      }
      `,
      options: [{ allowAsConst: true }],
    },

    // Good: Complex object construction
    `
    function getTournamentConfig() {
      const config: TournamentConfig = {
        maxPlayers: 64,
        minPlayers: 2,
        roundDuration: 3600
      };
      return config;
    }
    `,

    // Good: Type safety with transformations
    `
    function getMatchResult() {
      const score: MatchScore = {
        winner: 'player1',
        score: 100
      };
      const result: MatchResult = {
        ...score,
        timestamp: Date.now()
      };
      return result;
    }
    `,

    // Good: Proper typing with array methods
    `
    function getActivePlayers() {
      const activePlayers: ActivePlayer[] = players
        .filter((p): p is ActivePlayer => p.active);
      return activePlayers;
    }
    `,

    // Good: Type predicate functions should be allowed
    {
      code: `
      function isError(error: unknown): error is Error {
        return error instanceof Error;
      }
      `,
      options: [{ allowTypePredicates: true }],
    },

    // Good: Simple return of primitive values
    `
    function getCount() {
      return 5;
    }
    `,

    // Good: Return of variable
    `
    function getName() {
      const name = 'John';
      return name;
    }
    `,

    // Good: Return of function call without type assertion
    `
    function getUser() {
      return fetchUser();
    }
    `,

    // Good: Return of conditional expression
    `
    function getValue(condition: boolean) {
      return condition ? 'yes' : 'no';
    }
    `,

    // ==================== ADDITIONAL VALID CASES ====================

    // Good: Return of template literal
    `
    function getGreeting(name: string) {
      return \`Hello, \${name}!\`;
    }
    `,

    // Good: Return of array literal without type assertion
    `
    function getNumbers() {
      return [1, 2, 3, 4, 5];
    }
    `,

    // Good: Return of object literal without type assertion
    `
    function getDefaults() {
      return { enabled: true, visible: false };
    }
    `,

    // Good: Return of variable from try/catch
    `
    function safelyGetUser() {
      try {
        const user = fetchUser();
        return user;
      } catch (error) {
        const fallback: User = { id: 0, name: 'Guest' };
        return fallback;
      }
    }
    `,

    // Good: Return of variable with destructuring
    `
    function extractUserName(user: User) {
      const { name } = user;
      return name;
    }
    `,

    // Good: Return of variable with type guard
    `
    function getErrorMessage(error: unknown) {
      if (error instanceof Error) {
        const message = error.message;
        return message;
      }
      return 'Unknown error';
    }
    `,

    // Good: Return of variable with nullish coalescing
    `
    function getUserName(user?: User) {
      const name = user?.name ?? 'Guest';
      return name;
    }
    `,

    // Good: Return of variable with optional chaining
    `
    function getNestedProperty(obj: any) {
      const value = obj?.nested?.property;
      return value;
    }
    `,

    // ==================== EDGE CASES - VALID ====================

    // Good: Generic function with proper typing
    `
    function transform<T>(value: any) {
      const result: T = validateAndTransform(value);
      return result;
    }
    `,

    // Good: Type predicate in arrow function
    {
      code: `
      const isUser = (obj: unknown): obj is User => {
        return typeof obj === 'object' && obj !== null && 'id' in obj && 'name' in obj;
      };
      `,
      options: [{ allowTypePredicates: true }],
    },

    // Good: Function expression with type predicate
    {
      code: `
      const isAdmin = function(user: unknown): user is Admin {
        return typeof user === 'object' && user !== null && 'role' in user && user.role === 'admin';
      };
      `,
      options: [{ allowTypePredicates: true }],
    },

    // Good: Properly typed API response validation
    `
    function processApiResponse(data: unknown) {
      const validated: ApiResponse = validateApiResponse(data);
      return validated;
    }
    `,

    // Good: Building complete object from partial
    `
    function buildConfig(base: Partial<Config>) {
      const config: Config = {
        ...base,
        timestamp: Date.now(),
        required: 'field'
      };
      return config;
    }
    `,

    // Good: Properly typed Promise chain
    `
    function getUsers() {
      return fetch('/users')
        .then(r => r.json())
        .then(data => {
          const users: User[] = validateUsers(data);
          return users;
        });
    }
    `,

    // Good: Using type guard with filter
    `
    function getValidItems<T>(items: unknown[]): T[] {
      const validItems: T[] = items.filter((item): item is T => isValidItem<T>(item));
      return validItems;
    }
    `,

    // Good: Using map with proper typing
    `
    function transformItems<T, U>(items: T[]) {
      const transformed: U[] = items.map(item => {
        const result: U = transform<U>(item);
        return result;
      });
      return transformed;
    }
    `,

    // Good: Using reduce with proper typing
    `
    function sumValues(items: { value: number }[]) {
      const total: number = items.reduce((sum, item) => {
        return sum + item.value;
      }, 0);
      return total;
    }
    `,

    // Good: Using async/await with proper typing
    `
    async function fetchData() {
      const response = await fetch('/api/data');
      const data: ApiData = await response.json();
      return data;
    }
    `,

    // Good: Using type guard instead of type assertion
    `
    function processInput(input: unknown) {
      if (typeof input === 'object' && input !== null) {
        const data = input;
        const processed: ProcessedData = {
          id: typeof data.id === 'string' ? data.id : '',
          value: typeof data.value === 'number' ? data.value : 0
        };
        return processed;
      }
      return { id: '', value: 0 };
    }
    `,
  ],
  invalid: [
    // ==================== BASIC INVALID CASES ====================

    // Bad: Type assertion on return
    {
      code: `
      function getGroupFilters() {
        return [...someFilters] as TournamentGroupFilterParams;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion with angle brackets
    {
      code: `
      function getSettings() {
        return <UserSettings>{ theme: 'dark', notifications: true };
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Explicit return type with potential silent upcast
    {
      code: `
      function getPlayerStats(): PlayerStats {
        return {
          wins: 10,
          losses: 5
        };
      }
      `,
      errors: [{ messageId: 'useExplicitVariable' }],
    },

    // Bad: Inline type assertion
    {
      code: `
      function getTournamentConfig() {
        return {
          maxPlayers: 64,
          minPlayers: 2,
          roundDuration: 3600
        } as TournamentConfig;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Multiple type assertions
    {
      code: `
      function getMatchResult() {
        return ({
          winner: 'player1',
          score: 100
        } as MatchScore) as MatchResult;
      }
      `,
      errors: [
        { messageId: 'noTypeAssertionReturns' },
        { messageId: 'noTypeAssertionReturns' }
      ],
    },

    // Bad: Type assertion in array methods
    {
      code: `
      function getActivePlayers() {
        return players.filter(p => p.active) as ActivePlayer[];
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Arrow function with type assertion
    {
      code: `
      const getConfig = () => ({ id: 1, name: 'config' } as Config);
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Arrow function with explicit return type
    {
      code: `
      const getUser = (): User => ({
        id: 1,
        name: 'John'
      });
      `,
      errors: [{ messageId: 'useExplicitVariable' }],
    },

    // Bad: as const should not be permitted when option is false
    {
      code: `
      function getTournamentConfig() {
        return {
          maxPlayers: 64,
          minPlayers: 2,
          roundDuration: 3600
        } as const;
      }
      `,
      options: [{ allowAsConst: false }],
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type predicate should not be permitted when option is false
    {
      code: `
      function isError(error: unknown): error is Error {
        return error instanceof Error;
      }
      `,
      options: [{ allowTypePredicates: false }],
      errors: [{ messageId: 'useExplicitVariable' }],
    },

    // ==================== ADDITIONAL INVALID CASES ====================

    // Bad: Type assertion in conditional expression
    {
      code: `
      function getItem(condition: boolean) {
        return condition ? item1 : item2 as Item;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in template literal
    {
      code: `
      function getMessage() {
        return \`Status: \${getStatus()}\` as StatusMessage;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in array literal
    {
      code: `
      function getItems() {
        return [1, 2, 3] as Item[];
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in object spread
    {
      code: `
      function mergeObjects(obj1: any, obj2: any) {
        return { ...obj1, ...obj2 } as MergedObject;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in function call
    {
      code: `
      function processData(data: any) {
        return transform(data) as ProcessedData;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in array method chain
    {
      code: `
      function getNames() {
        return users.map(user => user.name) as string[];
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in Promise chain
    {
      code: `
      function fetchUsers() {
        return fetch('/api/users')
          .then(response => response.json())
          .then(data => data as User[]);
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in async function
    {
      code: `
      async function getUser(id: string) {
        const response = await fetch(\`/api/users/\${id}\`);
        return await response.json() as User;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // ==================== EDGE CASES - INVALID ====================

    // Bad: Generic function with type assertion
    {
      code: `
      function transform<T>(value: any): T {
        return value as T;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Arrow function with generic type assertion
    {
      code: `
      const transform = <T>(value: any) => value as T;
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Function expression with generic type assertion
    {
      code: `
      const transform = function<T>(value: any) {
        return value as T;
      };
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion with external API data
    {
      code: `
      function processApiResponse(data: unknown) {
        return data as ApiResponse;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Multiple nested type assertions
    {
      code: `
      function getNestedResult() {
        return ((data as RawData) as ProcessedData) as FinalResult;
      }
      `,
      errors: [
        { messageId: 'noTypeAssertionReturns' },
        { messageId: 'noTypeAssertionReturns' },
        { messageId: 'noTypeAssertionReturns' }
      ],
    },

    // Bad: Type assertion from partial type
    {
      code: `
      function buildConfig(base: Partial<Config>) {
        return {
          ...base,
          timestamp: Date.now()
        } as Config;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in array method chain with multiple methods
    {
      code: `
      function getActiveUserNames() {
        return users
          .filter(user => user.active)
          .map(user => user.name)
          .sort() as string[];
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in complex Promise chain
    {
      code: `
      function fetchAndProcessUsers() {
        return fetch('/api/users')
          .then(response => response.json())
          .then(data => processData(data))
          .then(result => result as ProcessedUsers);
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in async/await with try/catch
    {
      code: `
      async function safelyFetchUser(id: string) {
        try {
          const response = await fetch(\`/api/users/\${id}\`);
          return await response.json() as User;
        } catch (error) {
          return { id: '0', name: 'Unknown' } as User;
        }
      }
      `,
      errors: [
        { messageId: 'noTypeAssertionReturns' },
        { messageId: 'noTypeAssertionReturns' }
      ],
    },

    // Bad: Type assertion with nullish coalescing
    {
      code: `
      function getUserOrDefault(user?: unknown) {
        return (user ?? { id: '0', name: 'Guest' }) as User;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion with optional chaining
    {
      code: `
      function getNestedValue(obj: any) {
        return obj?.nested?.value as string;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in callback function
    {
      code: `
      function processItems(items: any[]) {
        return items.map(item => {
          return processItem(item) as ProcessedItem;
        });
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },

    // Bad: Type assertion in reduce method
    {
      code: `
      function combineObjects(objects: any[]) {
        return objects.reduce((result, obj) => {
          return { ...result, ...obj };
        }, {}) as CombinedObject;
      }
      `,
      errors: [{ messageId: 'noTypeAssertionReturns' }],
    },
  ],
});
