import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { visitorKeys } from '@typescript-eslint/visitor-keys';
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

function isNode(value: unknown): value is TSESTree.Node {
  return Boolean(value) && typeof value === 'object' && 'type' in (value as object);
}

function collectReturnInfo(
  body: TSESTree.BlockStatement,
): { assertions: TSESTree.TypeNode[]; returnCount: number } {
  const assertions: TSESTree.TypeNode[] = [];
  let returnCount = 0;
  const stack: TSESTree.Node[] = [...body.body];

  while (stack.length) {
    const current = stack.pop() as TSESTree.Node;

    if (current.type === AST_NODE_TYPES.ReturnStatement) {
      returnCount += 1;
      if (current.argument) {
        const assertion = getAssertionTypeNode(current.argument);
        if (assertion) assertions.push(assertion);
      }
      continue;
    }

    if (
      // Stop traversal at function/class boundaries; nested functions/classes have
      // their own scope and their return statements shouldn't affect the outer
      // function's return type check.
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      current.type === AST_NODE_TYPES.MethodDefinition ||
      current.type === AST_NODE_TYPES.ClassDeclaration ||
      current.type === AST_NODE_TYPES.ClassExpression
    ) {
      continue;
    }

    const keys = visitorKeys[current.type];
    if (!keys) continue;

    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];

      if (Array.isArray(value)) {
        for (const element of value) {
          if (isNode(element)) {
            stack.push(element);
          }
        }
        continue;
      }

      if (isNode(value)) {
        stack.push(value);
      }
    }
  }

  return { assertions, returnCount };
}

function findTypeAnnotationStart(
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: TSESLint.SourceCode,
): number {
  const start = typeAnnotation.range[0];
  const text = sourceCode.getText();

  let removalStart = start;

  for (let i = start - 1; i >= 0; i -= 1) {
    const char = text.charAt(i);

    if (char === '\n' || char === '\r') break;
    if (char === '?' || char === '!') {
      removalStart = i + 1;
      break;
    }
    if (!/\s/.test(char)) {
      removalStart = i + 1;
      break;
    }
    removalStart = i;
  }

  return removalStart;
}

function removeTypeAnnotation(
  fixer: TSESLint.RuleFixer,
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: TSESLint.SourceCode,
): TSESLint.RuleFix {
  const end = typeAnnotation.range[1];
  const removalStart = findTypeAnnotationStart(typeAnnotation, sourceCode);

  return fixer.removeRange([removalStart, end]);
}

function normalizeType(type: ts.Type): ts.Type {
  return type;
}

function typeText(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, TYPE_FORMAT_FLAGS);
}

function unwrapAlias(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const aliasSymbol = (type as ts.Type & { aliasSymbol?: ts.Symbol }).aliasSymbol;
  if (!aliasSymbol) return type;

  if ((aliasSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const target = checker.getAliasedSymbol(aliasSymbol);
    return checker.getDeclaredTypeOfSymbol(target);
  }

  if ((aliasSymbol.flags & ts.SymbolFlags.TypeAlias) !== 0) {
    const aliasTypeArguments = (
      type as ts.Type & { aliasTypeArguments?: ts.Type[] }
    ).aliasTypeArguments;

    if (aliasTypeArguments?.length) {
      return checker.getApparentType(type);
    }

    return checker.getDeclaredTypeOfSymbol(aliasSymbol);
  }

  return type;
}

function formatPropertySignature(
  prop: ts.Symbol,
  parentType: ts.Type,
  checker: ts.TypeChecker,
): string | null {
  const declaration =
    prop.valueDeclaration ??
    prop.declarations?.[0] ??
    parentType.symbol?.valueDeclaration ??
    parentType.symbol?.declarations?.[0];
  if (!declaration) return null;

  const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
  const text = typeText(unwrapAlias(propType, checker), checker);
  const isOptional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;

  return `${prop.getName()}${isOptional ? '?' : ''}:${text}`;
}

function getFormattedTypeProperties(
  type: ts.Type,
  checker: ts.TypeChecker,
): string[] {
  return checker
    .getPropertiesOfType(type)
    .map((prop) => formatPropertySignature(prop, type, checker))
    .filter((entry): entry is string => Boolean(entry))
    .sort();
}

function getFormattedCallSignatures(
  type: ts.Type,
  checker: ts.TypeChecker,
): string[] {
  return checker
    .getSignaturesOfType(type, ts.SignatureKind.Call)
    .map((sig) => checker.signatureToString(sig, undefined, TYPE_FORMAT_FLAGS))
    .sort();
}

function structuralKey(type: ts.Type, checker: ts.TypeChecker): string {
  const apparent = checker.getApparentType(type);
  const properties = getFormattedTypeProperties(apparent, checker);
  const signatures = getFormattedCallSignatures(apparent, checker);

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

  return normalizeType(unwrapped);
}

type TypeRepresentations = {
  annotationText: string;
  assertionText: string;
  annotationCanonical: string;
  assertionCanonical: string;
  annotationStructural: string;
  assertionStructural: string;
};

/**
 * Generate multiple string representations of both types for comparison.
 * Multiple strategies are needed because TypeScript types can be semantically
 * identical yet have different string representations depending on:
 * - Type aliases (MyType vs the underlying type) via canonical/NoTypeReduction
 * - Type formatting options (fully qualified vs relative) via default text
 * - Structural equivalence (different names, same shape) via structural key
 */
function getTypeRepresentations(
  annotationType: ts.Type,
  assertionType: ts.Type,
  checker: ts.TypeChecker,
): TypeRepresentations {
  return {
    annotationText: typeText(annotationType, checker),
    assertionText: typeText(assertionType, checker),
    annotationCanonical: checker.typeToString(
      normalizeType(annotationType),
      undefined,
      TYPE_FORMAT_FLAGS | ts.TypeFormatFlags.NoTypeReduction,
    ),
    assertionCanonical: checker.typeToString(
      normalizeType(assertionType),
      undefined,
      TYPE_FORMAT_FLAGS | ts.TypeFormatFlags.NoTypeReduction,
    ),
    annotationStructural: structuralKey(annotationType, checker),
    assertionStructural: structuralKey(assertionType, checker),
  };
}

function areTypesIdentical(
  annotationType: ts.Type,
  assertionType: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if (annotationType === assertionType) return true;

  const isTypeIdenticalTo = (checker as {
    isTypeIdenticalTo?: (a: ts.Type, b: ts.Type) => boolean;
  }).isTypeIdenticalTo;

  // Guard the internal TypeScript helper; newer compiler versions may drop or change it.
  if (typeof isTypeIdenticalTo !== 'function') {
    return false;
  }

  return isTypeIdenticalTo(annotationType, assertionType) === true;
}

function areTypesAssignableBothWays(
  annotationType: ts.Type,
  assertionType: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  const isTypeAssignableTo = (checker as {
    isTypeAssignableTo?: (a: ts.Type, b: ts.Type) => boolean;
  }).isTypeAssignableTo;

  // Guard for checker.isTypeAssignableTo which may be absent from some d.ts versions.
  if (typeof isTypeAssignableTo !== 'function') {
    return false;
  }

  return (
    isTypeAssignableTo(annotationType, assertionType) &&
    isTypeAssignableTo(assertionType, annotationType)
  );
}

function doTypeTextsMatch(representations: TypeRepresentations): boolean {
  const {
    annotationText,
    assertionText,
    annotationCanonical,
    assertionCanonical,
    annotationStructural,
    assertionStructural,
  } = representations;

  return (
    annotationText === assertionText ||
    annotationCanonical === assertionCanonical ||
    annotationStructural === assertionStructural
  );
}

function selectMatchingTypeRepresentation(
  representations: TypeRepresentations,
): string {
  return representations.annotationText;
}

// Compare annotation and assertion types across identity, assignability, and
// multiple textual forms so equivalent aliases still count as redundant.
function haveMatchingTypes(
  annotation: TSESTree.TypeNode,
  assertion: TSESTree.TypeNode,
  checker: ts.TypeChecker,
  services: ParserServices,
): string | null {
  const annotationType = getComparableType(annotation, checker, services);
  const assertionType = getComparableType(assertion, checker, services);

  if (!annotationType || !assertionType) return null;

  const representations = getTypeRepresentations(
    annotationType,
    assertionType,
    checker,
  );

  const identical = areTypesIdentical(annotationType, assertionType, checker);
  const assignableBothWays = areTypesAssignableBothWays(
    annotationType,
    assertionType,
    checker,
  );
  const textMatches = doTypeTextsMatch(representations);

  if (!identical && (!assignableBothWays || !textMatches)) {
    return null;
  }

  return selectMatchingTypeRepresentation(representations);
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
    const { assertions, returnCount } = collectReturnInfo(body);

    // Skip functions with multiple returns because different branches can assert different types.
    if (returnCount !== 1) return null;

    // Ensure the single return is the last statement in the function body
    // to avoid cases where an implicit undefined return exists.
    const lastStatement = body.body[body.body.length - 1];
    if (lastStatement?.type !== AST_NODE_TYPES.ReturnStatement) {
      return null;
    }

    return assertions[0] ?? null;
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
    const sourceCode =
      (context as typeof context & { sourceCode?: TSESLint.SourceCode }).sourceCode ??
      context.getSourceCode?.();
    const parserServices = sourceCode?.parserServices ?? context.parserServices;

    if (
      !sourceCode ||
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
          !node.id.typeAnnotation ||
          node.id.optional
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
        if (!node.typeAnnotation || !node.value || node.optional) return;

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
