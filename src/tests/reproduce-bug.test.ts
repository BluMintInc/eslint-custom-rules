import { noEntireObjectHookDeps } from '../rules/no-entire-object-hook-deps';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

// Create a simple test to verify the rule works
describe('no-entire-object-hook-deps rule', () => {
  it('should detect object properties in hook dependencies', () => {
    // Create a mock context
    const context = {
      report: jest.fn(),
      parserServices: {}, // No TypeScript services for this test
    };

    // Create the rule listener
    const ruleListener = noEntireObjectHookDeps.create(context);

    // Create a simplified AST for the test case
    const mockNode = {
      type: AST_NODE_TYPES.CallExpression,
      callee: {
        type: AST_NODE_TYPES.Identifier,
        name: 'useMemo',
      },
      arguments: [
        {
          type: AST_NODE_TYPES.ArrowFunctionExpression,
          body: {
            type: AST_NODE_TYPES.BlockStatement,
            body: [
              {
                type: AST_NODE_TYPES.ReturnStatement,
                argument: {
                  type: AST_NODE_TYPES.MemberExpression,
                  object: {
                    type: AST_NODE_TYPES.MemberExpression,
                    object: {
                      type: AST_NODE_TYPES.MemberExpression,
                      object: {
                        type: AST_NODE_TYPES.Identifier,
                        name: 'theme',
                      },
                      property: {
                        type: AST_NODE_TYPES.Identifier,
                        name: 'palette',
                      },
                      computed: false,
                    },
                    property: {
                      type: AST_NODE_TYPES.Identifier,
                      name: 'primary',
                    },
                    computed: false,
                  },
                  property: {
                    type: AST_NODE_TYPES.Identifier,
                    name: 'dark',
                  },
                  computed: false,
                },
              },
            ],
          },
        },
        {
          type: AST_NODE_TYPES.ArrayExpression,
          elements: [
            {
              type: AST_NODE_TYPES.Identifier,
              name: 'theme',
            },
          ],
        },
      ],
    };

    // Call the rule listener with the mock node
    ruleListener.CallExpression(mockNode);

    // Verify that the rule reported an issue
    expect(context.report).toHaveBeenCalled();

    // Check the report data
    const reportCall = context.report.mock.calls[0][0];
    expect(reportCall.messageId).toBe('avoidEntireObject');
    expect(reportCall.data.objectName).toBe('theme');
    expect(reportCall.data.fields).toContain('theme.palette.primary.dark');
  });
});
