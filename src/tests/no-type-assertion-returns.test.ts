import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('no-type-assertion-returns', noTypeAssertionReturns, {
  valid: [
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
  ],
  invalid: [
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
  ],
});
