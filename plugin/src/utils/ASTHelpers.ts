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
      case 'TSNonNullExpression':
        return this.declarationIncludesIdentifier(node.expression);
      case 'ArrayPattern':
        return node.elements.some((element) =>
          ASTHelpers.declarationIncludesIdentifier(element),
        );
      case 'ObjectPattern':
        return node.properties.some((property) =>
          this.declarationIncludesIdentifier(property.value || null),
        );
      case 'AssignmentPattern':
        return this.declarationIncludesIdentifier(node.left);
      case 'RestElement':
        return this.declarationIncludesIdentifier(node.argument);
      case 'AwaitExpression':
        return this.declarationIncludesIdentifier(node.argument);
      case 'AssignmentExpression':
        return (
          this.declarationIncludesIdentifier(node.left) ||
          this.declarationIncludesIdentifier(node.right)
        );
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
      case 'TSTypeAssertion':
        return this.declarationIncludesIdentifier(node.expression);
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
        if (node.object.type === 'ThisExpression') {
          return true;
        }
        return (
          this.declarationIncludesIdentifier(node.object) ||
          this.declarationIncludesIdentifier(node.property)
        );

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
      case 'TSAsExpression':
        return this.declarationIncludesIdentifier(node.expression);

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

  public static isNodeExported(node: TSESTree.Node) {
    // Checking if the node is exported as a named export.
    if (node.parent && node.parent.type === 'ExportNamedDeclaration') {
      return true;
    }

    // Checking if the node is exported as default.
    if (
      node.parent &&
      node.parent.parent &&
      node.parent.parent.type === 'ExportDefaultDeclaration'
    ) {
      return true;
    }

    // Checking if the node is exported in a list of exports.
    if (
      node.parent &&
      node.parent.parent &&
      node.parent.parent.type === 'ExportSpecifier' &&
      node.parent.parent.exported.name === (node as TSESTree.Identifier).name
    ) {
      return true;
    }

    return false;
  }
}

