import { TSESTree } from '@typescript-eslint/utils';

export class ASTHelpers {
  public static blockIncludesIdentifier(
    block: TSESTree.BlockStatement,
  ): boolean {
    for (const statement of block.body) {
      if (ASTHelpers.declarationIncludesIdentifier(statement)) {
        return true;
      }
    }
    return false;
  }

  public static declarationIncludesIdentifier(
    node: TSESTree.Node | null,
  ): boolean {
    if (!node) {
      return false;
    }
    switch (node.type) {
      case 'BlockStatement':
        return node.body.some(
          (statement) =>
            statement.type === 'BlockStatement' &&
            ASTHelpers.blockIncludesIdentifier(statement),
        );
      case 'IfStatement':
        return (
          this.declarationIncludesIdentifier(node.test) ||
          this.declarationIncludesIdentifier(node.consequent) ||
          this.declarationIncludesIdentifier(node.alternate)
        );
      case 'Identifier':
        return true;
      case 'SpreadElement':
        return ASTHelpers.declarationIncludesIdentifier(node.argument);
      case 'ChainExpression':
        return ASTHelpers.declarationIncludesIdentifier(node.expression);
      case 'ArrayExpression':
        return node.elements.some(
          (element) =>
            element &&
            (element.type === 'SpreadElement'
              ? ASTHelpers.declarationIncludesIdentifier(element.argument)
              : ASTHelpers.declarationIncludesIdentifier(element)),
        );
      case 'ObjectExpression':
        return node.properties.some((property) => {
          if (property.type === 'Property') {
            return ASTHelpers.declarationIncludesIdentifier(property.value);
          } else if (property.type === 'SpreadElement') {
            return ASTHelpers.declarationIncludesIdentifier(property.argument);
          }
          return false;
        });

      case 'Property':
        return this.declarationIncludesIdentifier(node.value);

      case 'BinaryExpression':
      case 'LogicalExpression':
        return (
          this.declarationIncludesIdentifier(node.left) ||
          this.declarationIncludesIdentifier(node.right)
        );

      case 'UnaryExpression':
      case 'UpdateExpression':
        return this.declarationIncludesIdentifier(node.argument);
      case 'MemberExpression':
        return this.declarationIncludesIdentifier(node.object);

      case 'CallExpression':
      case 'NewExpression':
        // For function and constructor calls, we care about both the callee and the arguments.
        return (
          this.declarationIncludesIdentifier(node.callee) ||
          node.arguments.some((arg) => this.declarationIncludesIdentifier(arg))
        );

      case 'ConditionalExpression':
        return (
          this.declarationIncludesIdentifier(node.test) ||
          this.declarationIncludesIdentifier(node.consequent) ||
          this.declarationIncludesIdentifier(node.alternate)
        );

      default:
        return false;
    }
  }

  public static isNode(value: unknown): value is TSESTree.Node {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  public static hasReturnStatement(node: TSESTree.Node): boolean {
    if (node.type === 'ReturnStatement') {
      return true;
    }
    if (node.type === 'IfStatement') {
      const consequentHasReturn = ASTHelpers.hasReturnStatement(
        node.consequent,
      );
      const alternateHasReturn =
        !!node.alternate && ASTHelpers.hasReturnStatement(node.alternate);
      return consequentHasReturn && alternateHasReturn;
    }
    if (node.type === 'BlockStatement') {
      for (const statement of node.body) {
        if (ASTHelpers.hasReturnStatement(statement)) {
          return true;
        }
      }
    }

    for (const key in node) {
      if (key === 'parent') {
        continue; // Ignore the parent property
      }
      const value = node[key as keyof typeof node];
      if (ASTHelpers.isNode(value)) {
        if (ASTHelpers.hasReturnStatement(value)) {
          return true;
        }
      }
    }

    return false;
  }
}
