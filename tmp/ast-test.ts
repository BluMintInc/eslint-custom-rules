import { TSESTree } from '@typescript-eslint/utils';

// This is a helper function to understand the AST structure
function isNumericLiteral(node: TSESTree.Node): boolean {
  return node.type === 'Literal' && typeof (node as TSESTree.Literal).value === 'number';
}

// This is a helper function to check if a numeric literal is 0 or 1
function isZeroOrOne(node: TSESTree.Node): boolean {
  if (isNumericLiteral(node)) {
    const value = (node as TSESTree.Literal).value as number;
    return value === 0 || value === 1;
  }
  return false;
}

// This function will check for numeric literals in loop expressions
function checkLoopExpressions(node: TSESTree.ForStatement): void {
  // Check initialization
  if (node.init && node.init.type === 'VariableDeclaration') {
    for (const decl of node.init.declarations) {
      if (decl.init && isNumericLiteral(decl.init) && !isZeroOrOne(decl.init)) {
        console.log('Found non-zero/one numeric literal in loop initialization');
      }
    }
  }

  // Check test condition
  if (node.test && node.test.type === 'BinaryExpression') {
    if (isNumericLiteral(node.test.right) && !isZeroOrOne(node.test.right)) {
      console.log('Found non-zero/one numeric literal in loop test condition');
    }
  }

  // Check update expression
  if (node.update && node.update.type === 'AssignmentExpression') {
    if (node.update.right && isNumericLiteral(node.update.right) && !isZeroOrOne(node.update.right)) {
      console.log('Found non-zero/one numeric literal in loop update expression');
    }
  } else if (node.update && node.update.type === 'BinaryExpression') {
    if (isNumericLiteral(node.update.right) && !isZeroOrOne(node.update.right)) {
      console.log('Found non-zero/one numeric literal in loop update expression');
    }
  }
}
