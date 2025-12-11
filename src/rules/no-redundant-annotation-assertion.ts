import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import { createRule } from '../utils/createRule';

type MessageIds = 'redundantAnnotationAndAssertion';

const TYPE_FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.WriteArrayAsGenericType |
  ts.TypeFormatFlags.UseFullyQualifiedType |
  ts.TypeFormatFlags.UseStructuralFallback;

function isTypeNode(node: ts.Node): node is ts.TypeNode {
  return ts.isTypeNode(node);
}

function getAssertionTypeNode(
  expression: TSESTree.Node | null | undefined,
): TSESTree.TypeNode | null {
  if (!expression) return null;

  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return expression.typeAnnotation;
  }

  if (expression.type === AST_NODE_TYPES.TSTypeAssertion) {
    return expression.typeAnnotation;
  }

  return null;
}

function removeTypeAnnotation(
  fixer: TSESLint.RuleFixer,
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: TSESLint.SourceCode,
): TSESLint.RuleFix {
  const start = typeAnnotation.range[0];
  const hasQuestionMark =
    start > 0 && sourceCode.getText().charAt(start - 1) === '?';
  const removalStart = hasQuestionMark ? start - 1 : start;

  return fixer.removeRange([removalStart, typeAnnotation.range[1]]);
}

function normalizeType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  return checker.getApparentType(checker.getBaseTypeOfLiteralType(type));
}

function typeText(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, TYPE_FORMAT_FLAGS);
}

function unwrapAlias(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const aliasSymbol = (type as ts.Type & { aliasSymbol?: ts.Symbol }).aliasSymbol;
  if (aliasSymbol && (aliasSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const target = checker.getAliasedSymbol(aliasSymbol);
    return checker.getDeclaredTypeOfSymbol(target);
  }

  return type;
}

function structuralKey(type: ts.Type, checker: ts.TypeChecker): string {
  const normalized = normalizeType(type, checker);
  const properties = checker
    .getPropertiesOfType(normalized)
    .map((prop) => {
      const declaration =
        prop.valueDeclaration ??
        prop.declarations?.[0] ??
        normalized.symbol?.valueDeclaration ??
        normalized.symbol?.declarations?.[0];
      if (!declaration) return null;

      const propType = checker.getTypeOfSymbolAtLocation(
        prop,
        declaration,
      );
      const text = typeText(unwrapAlias(propType, checker), checker);
      const isOptional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;
      return `${prop.getName()}${isOptional ? '?' : ''}:${text}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .sort();

  const signatures = checker
    .getSignaturesOfType(normalized, ts.SignatureKind.Call)
    .map((sig) => checker.signatureToString(sig, undefined, TYPE_FORMAT_FLAGS))
    .sort();

  return `${properties.join('|')}::${signatures.join('|')}`;
}

type ParserServices = NonNullable<
  TSESLint.RuleContext<string, unknown[]>['parserServices']
>;

function getComparableType(
  typeNode: TSESTree.TypeNode,
  checker: ts.TypeChecker,
  services: ParserServices,
): ts.Type | null {
  const tsNode = services.esTreeNodeToTSNodeMap.get(typeNode);
  if (!isTypeNode(tsNode)) return null;

  const type = checker.getTypeFromTypeNode(tsNode);
  const unwrapped = unwrapAlias(type, checker);

  return normalizeType(unwrapped, checker);
}

function haveMatchingTypes(
  annotation: TSESTree.TypeNode,
  assertion: TSESTree.TypeNode,
  checker: ts.TypeChecker,
  services: ParserServices,
): string | null {
  const annotationType = getComparableType(annotation, checker, services);
  const assertionType = getComparableType(assertion, checker, services);

  if (!annotationType || !assertionType) return null;

  const annotationText = typeText(annotationType, checker);
  const assertionText = typeText(assertionType, checker);
  const annotationCanonical = checker.typeToString(
    normalizeType(annotationType, checker),
    undefined,
    TYPE_FORMAT_FLAGS | ts.TypeFormatFlags.NoTypeReduction,
  );
  const assertionCanonical = checker.typeToString(
    normalizeType(assertionType, checker),
    undefined,
    TYPE_FORMAT_FLAGS | ts.TypeFormatFlags.NoTypeReduction,
  );
  const annotationExpanded = typeText(
    checker.getBaseTypeOfLiteralType(annotationType),
    checker,
  );
  const assertionExpanded = typeText(
    checker.getBaseTypeOfLiteralType(assertionType),
    checker,
  );

  const assignableBothWays =
    checker.isTypeAssignableTo(annotationType, assertionType) &&
    checker.isTypeAssignableTo(assertionType, annotationType);

  const identical =
    annotationType === assertionType ||
    (checker as { isTypeIdenticalTo?: (a: ts.Type, b: ts.Type) => boolean })
      .isTypeIdenticalTo?.(annotationType, assertionType);

  const textMatches =
    annotationText === assertionText ||
    annotationExpanded === assertionExpanded ||
    annotationText === assertionExpanded ||
    assertionText === annotationExpanded ||
    annotationCanonical === assertionCanonical ||
    structuralKey(annotationType, checker) === structuralKey(assertionType, checker);

  if (!identical && (!assignableBothWays || !textMatches)) {
    return null;
  }

  if (annotationText === assertionText) {
    return annotationText;
  }

  if (annotationExpanded === assertionExpanded) {
    return annotationExpanded;
  }

  return annotationText;
}

function getReturnAssertion(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | TSESTree.MethodDefinition,
): TSESTree.TypeNode | null {
  const value =
    node.type === AST_NODE_TYPES.MethodDefinition ? node.value : node;

  const body = (
    value as {
      body: TSESTree.BlockStatement | TSESTree.Expression | null | undefined;
    }
  ).body;

  if (body?.type === AST_NODE_TYPES.BlockStatement) {
    const returns = body.body.filter(
      (statement): statement is TSESTree.ReturnStatement =>
        statement.type === AST_NODE_TYPES.ReturnStatement &&
        Boolean(statement.argument),
    );

    if (returns.length !== 1) return null;

    return getAssertionTypeNode(returns[0].argument);
  }

  if (!body) return null;

  return getAssertionTypeNode(body);
}

export const noRedundantAnnotationAssertion = createRule<[], MessageIds>({
  name: 'no-redundant-annotation-assertion',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow combining a type annotation with an identical type assertion on the same value. Keep a single source of truth to avoid redundant type declarations that can drift apart.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantAnnotationAndAssertion:
        'Type "{{type}}" is declared twice: once as an annotation and again as an assertion. Duplicating the same type leaves two sources of truth that can diverge; keep only one (prefer keeping the assertion) to keep the declaration maintainable.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;

    if (
      !parserServices?.program ||
      !parserServices.esTreeNodeToTSNodeMap ||
      !parserServices.tsNodeToESTreeNodeMap
    ) {
      /* istanbul ignore next -- without type information the rule cannot run */
      return {};
    }

    const checker = parserServices.program.getTypeChecker();

    function reportIfRedundant(
      annotation: TSESTree.TSTypeAnnotation,
      assertion: TSESTree.TypeNode,
      reportNode: TSESTree.Node,
      fixerTarget: TSESTree.TSTypeAnnotation,
    ) {
      const matchingType = haveMatchingTypes(
        annotation.typeAnnotation,
        assertion,
        checker,
        parserServices as ParserServices,
      );

      if (!matchingType) return;

      context.report({
        node: reportNode,
        messageId: 'redundantAnnotationAndAssertion',
        data: { type: matchingType },
        fix: (fixer) => removeTypeAnnotation(fixer, fixerTarget, sourceCode),
      });
    }

    return {
      VariableDeclarator(node) {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !node.id.typeAnnotation
        ) {
          return;
        }

        const assertionType = getAssertionTypeNode(node.init);
        if (!assertionType) return;

        reportIfRedundant(
          node.id.typeAnnotation,
          assertionType,
          node.id,
          node.id.typeAnnotation,
        );
      },
      PropertyDefinition(node) {
        if (!node.typeAnnotation || !node.value) return;

        const assertionType = getAssertionTypeNode(node.value);
        if (!assertionType) return;

        reportIfRedundant(
          node.typeAnnotation,
          assertionType,
          node.key,
          node.typeAnnotation,
        );
      },
      FunctionDeclaration(node) {
        if (!node.returnType) return;
        const assertionType = getReturnAssertion(node);
        if (!assertionType) return;

        reportIfRedundant(
          node.returnType,
          assertionType,
          node.id ?? node,
          node.returnType,
        );
      },
      FunctionExpression(node) {
        if (node.parent?.type === AST_NODE_TYPES.MethodDefinition) {
          return;
        }

        if (!node.returnType) return;
        const assertionType = getReturnAssertion(node);
        if (!assertionType) return;

        reportIfRedundant(
          node.returnType,
          assertionType,
          node,
          node.returnType,
        );
      },
      ArrowFunctionExpression(node) {
        if (!node.returnType) return;
        const assertionType = getReturnAssertion(node);
        if (!assertionType) return;

        reportIfRedundant(
          node.returnType,
          assertionType,
          node,
          node.returnType,
        );
      },
      MethodDefinition(node) {
        if (!node.value.returnType) return;
        const assertionType = getReturnAssertion(node);
        if (!assertionType) return;

        reportIfRedundant(
          node.value.returnType,
          assertionType,
          node.key,
          node.value.returnType,
        );
      },
    };
  },
});
