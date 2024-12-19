import { extractGlobalConstants } from '../rules/extract-global-constants';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('extract-global-constants', extractGlobalConstants, {
  valid: [
    `function Component({ prop }) {
          const dependentConst = prop + 1;
          return <div>{dependentConst}</div>;
        }`,
    // Case 1b: Constants with template literals that depend on variables
    `function Component({ width }) {
      const params = [\`w-\${width}\`];
      return <div>{params}</div>;
    }`,
    // Case 1c: Template literal constant that depends on a prop
    `function Component({ name }) {
      const greeting = \`Hello \${name}!\`;
      return <div>{greeting}</div>;
    }`,
    `function Component({ prop }) {
          const dependentConst = [prop];
          return <div>{dependentConst}</div>;
        }`,
    `function Component({ prop1,prop2 }) {
          const dependentConst = [...prop2];
          return <div>{dependentConst}</div>;
        }`,
    `function Component({ prop }) {
          const dependentConst = {a: 1,prop};
          return <div>{dependentConst}</div>;
        }`,
    `function Component({ prop1,prop2 }) {
          const dependentConst = {...prop2};
          return <div>{dependentConst}</div>;
        }`,
    // Case 2b: Constants that are already in the global scope, with dependencies
    `const GLOBAL_CONST = 'value';
          const OTHER_GLOBAL_CONST = GLOBAL_CONST.toUpperCase();
          function Component({prop}) {
            return <div>{GLOBAL_CONST}{prop}</div>;
          }`,
    // Case 3: Constants that are not in function components or hooks
    `const nonComponentConst = 'value';`,
    // Case 4: Functions as constants that are not in function components or hooks
    'const someFunc = (input: any) => `${input}`;',
    // Case 5: Functions as constants that are not in function components or hooks
    'const someFunc = (input: {a?: number}) => input?.a',
    // For completeness
    `export const noFilterWithoutReturn: TSESLint.RuleModule<'unexpected', never[]> =
      createRule({
        create(context) {
          return {
            'CallExpression[callee.property.name="filter"]'(
              node: TSESTree.CallExpression,
            ) {
              const callback = node.arguments[0];
              if (callback && callback.type === 'ArrowFunctionExpression') {
                const { body } = callback;
                if (body.type !== 'BlockStatement') {
                  // If the body is not a block statement, it's a direct return
                  return;
                }
                if (!ASTHelpers.hasReturnStatement(body)) {
                  context.report({
                    node,
                    messageId: 'unexpected',
                  });
                }
              }
            },
          };
        },
        name: 'no-filter-without-return',
        meta: {
          type: 'problem',
          docs: {
            description:
              'Disallow Array.filter callbacks without an explicit return (if part of a block statement)',
            recommended: 'error',
          },
          schema: [],
          messages: {
            unexpected:
              'An array filter callback with a block statement must contain a return statement',
          },
        },
        defaultOptions: [],
      });
    `,
    `export const testingAFunction = (input: Record<string, unknown>) => {
      const a = input?.a;
      return a;
    };`,
    `export const updateCurrentGame = https.onCall(
      async ({
        uid,
        gameId,
        playing,
      }: UpdateCurrentGameParams): UpdateCurrentGameResponse => {
        const gameRef = db.doc(\`Game/\${gameId}\`);
        const gameDoc = await gameRef.get();
        const game = gameDoc.data() as Game;
        const userStatusDatabaseRef = realtimeDb.ref(\`/status/\${uid}\`);
        const currentRealtimeData = await userStatusDatabaseRef
          .get()
          .then((snap) => snap.val());
      });`,
    `export class StreamSecretary {
      constructor(private readonly req: https.Request) {}
    
      public async verifySignature(): Promise<number | undefined> {
        const { headers, body } = this.req;
        const [foo,bar] = this.req
        const { someThing } = await this.fake(this.req)
        try {
          Moralis.Streams.verifySignature({
            body,
            signature: headers['x-signature'] as string,
          });
          return;
        } catch (error) {
          logger.error(error);
          return 401;
        }
      }
    }`,
    `class Foo {
      private get participantsChanged(): ParticipantTeam[] {
        if (!this.tournamentBefore || !this.tournamentBefore) {
          return [];
        }
    
        const { participantsAggregated: participantsBefore = [] } =
          this.tournamentBefore!;
        const { participantsAggregated: participantsAfter = [] } =
          this.tournamentAfter!;
    
        return participantsAfter.filter((teamAfter) => {
          const teamBefore = participantsBefore.find(
            (team) => team.id === teamAfter.id,
          );
          return teamBefore && !equal(teamAfter, teamBefore);
        });
      }
    }`,
    `class Foo {
      private readonly something: string;
      public static bar() {
        const baz = this.something
        return \`2*\${baz}\`;
      }
    }`,
  ],
  invalid: [
    // Case 1: Constants inside function components that don't depend on anything
    `function Component() {
      const independentConst = 'value';
      return <div>{independentConst}</div>;
    }`,
    // Case 2: Constants inside hooks that don't depend on anything
    `function useHook() {
      const independentConst = 'value';
      return independentConst;
    }`,
    // Case 3: Constants as functions inside hooks that don't depend on anything
    'function useHook() { const someExtractableFunction = (input: any) => `${input}2`}',
    `function useHook() {
        if (isValid) {
          const shouldBeGlobal = 'IF_VALID_MESSAGE';
          return 'ERROR:' + shouldBeGlobal;
        }
        return;
      };`,
    `const someFunc = (a,b) => {
      if (a > 0) {
          const shouldBeInvalid = 'HELLO'
      }
    }`,
  ].map((testCase) => {
    return {
      code: testCase,
      errors: [{ messageId: 'extractGlobalConstants' }],
    };
  }),
});
