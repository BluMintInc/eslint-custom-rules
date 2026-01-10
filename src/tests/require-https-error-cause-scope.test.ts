import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { requireHttpsErrorCause } from '../rules/require-https-error-cause';

// This test file specifically verifies the ESLint 8/9 scope shim in require-https-error-cause.
// It uses manual mocks to exercise both the ESLint 8 path (context.getScope)
// and the ESLint 9 path (sourceCode.getScope).

describe('require-https-error-cause scope shim', () => {
  it('should use sourceCode.getScope in ESLint 9+', () => {
    const mockScope = { variables: [], upper: null } as unknown as TSESLint.Scope.Scope;
    
    const mockSourceCode = {
      getScope: jest.fn().mockReturnValue(mockScope),
      getText: jest.fn().mockReturnValue('error'),
    };

    const mockContext = {
      getSourceCode: jest.fn().mockReturnValue(mockSourceCode),
      sourceCode: mockSourceCode,
      report: jest.fn(),
      getScope: jest.fn(),
      getFilename: jest.fn().mockReturnValue('test.ts'),
    } as unknown as TSESLint.RuleContext<any, any>;

    const rule = requireHttpsErrorCause.create(mockContext);
    
    // Trigger CatchClause to set up state
    const catchNode = {
      type: 'CatchClause',
      param: { type: 'Identifier', name: 'error' },
      body: { type: 'BlockStatement', body: [] },
    } as unknown as TSESTree.CatchClause;
    
    (rule as any).CatchClause(catchNode);

    // Trigger NewExpression which calls getScopeForNode via isCatchBindingReference
    const httpsErrorNode = {
      type: 'NewExpression',
      callee: { type: 'Identifier', name: 'HttpsError' },
      arguments: [
        { type: 'Literal', value: 'internal' },
        { type: 'Literal', value: 'msg' },
        { type: 'Identifier', name: 'undefined' },
        { type: 'Identifier', name: 'error' },
      ],
    } as unknown as TSESTree.NewExpression;

    (rule as any).NewExpression(httpsErrorNode);

    expect(mockSourceCode.getScope).toHaveBeenCalledWith(expect.objectContaining({ name: 'error' }));
    expect(mockContext.getScope).not.toHaveBeenCalled();
  });

  it('should fallback to context.getScope in ESLint 8', () => {
    const mockScope = { variables: [], upper: null } as unknown as TSESLint.Scope.Scope;
    
    const mockSourceCode = {
      // No getScope method
      getText: jest.fn().mockReturnValue('error'),
    };

    const mockContext = {
      getSourceCode: jest.fn().mockReturnValue(mockSourceCode),
      sourceCode: mockSourceCode,
      report: jest.fn(),
      getScope: jest.fn().mockReturnValue(mockScope),
      getFilename: jest.fn().mockReturnValue('test.ts'),
    } as unknown as TSESLint.RuleContext<any, any>;

    const rule = requireHttpsErrorCause.create(mockContext);
    
    // Trigger CatchClause
    const catchNode = {
      type: 'CatchClause',
      param: { type: 'Identifier', name: 'error' },
      body: { type: 'BlockStatement', body: [] },
    } as unknown as TSESTree.CatchClause;
    
    (rule as any).CatchClause(catchNode);

    // Trigger NewExpression
    const httpsErrorNode = {
      type: 'NewExpression',
      callee: { type: 'Identifier', name: 'HttpsError' },
      arguments: [
        { type: 'Literal', value: 'internal' },
        { type: 'Literal', value: 'msg' },
        { type: 'Identifier', name: 'undefined' },
        { type: 'Identifier', name: 'error' },
      ],
    } as unknown as TSESTree.NewExpression;

    (rule as any).NewExpression(httpsErrorNode);

    expect(mockContext.getScope).toHaveBeenCalled();
  });
});
