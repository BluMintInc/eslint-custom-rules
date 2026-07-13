import * as path from 'path';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'multipleExportedComponents' | 'multipleExportedClasses';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type Classification = 'component' | 'class' | 'neither';

/**
 * React heritage names that make a `class` a component rather than a plain
 * class. Deeper indirection (aliased imports, HOC-produced base classes) is an
 * acceptable false negative per the false-negative bias.
 */
const REACT_COMPONENT_BASES = new Set([
  'Component',
  'PureComponent',
  'React.Component',
  'React.PureComponent',
]);

/**
 * Call expressions that always produce a React component from their (unwrapped)
 * argument. Any of these as the initializer of a PascalCase const marks it a
 * component unit regardless of whether the wrapped function is locally visible.
 */
const REACT_COMPONENT_WRAPPERS = new Set([
  'memo',
  'React.memo',
  'forwardRef',
  'React.forwardRef',
]);

/**
 * Call expressions whose PascalCase result is deliberately NOT a component
 * (a React context object is PascalCase by convention but never renders).
 */
const NON_COMPONENT_FACTORIES = new Set([
  'createContext',
  'React.createContext',
]);

/**
 * A React component export must be PascalCase. This deliberately excludes
 * SCREAMING_SNAKE_CASE constants (underscores) and hooks (`/^use[A-Z]/` starts
 * lowercase), so neither can ever be miscounted as a component.
 */
function isComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * Mirrors `prefer-utility-function-own-file`'s exemption model (test/spec, mock,
 * declaration files) minus its `/types/` carve-out, which this rule does not use.
 * `*.stories.tsx` is intentionally NOT exempt in v1 — see the rule docs.
 */
function isExemptFile(filename: string): boolean {
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, '/');
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(normalized)) return true;
  if (/\/__mocks__\//.test(normalized)) return true;
  if (/\.d\.ts$/.test(normalized)) return true;
  return false;
}

/**
 * Strips TypeScript-only expression wrappers (`as`, `satisfies`, `!`, `<T>x`) so
 * the underlying function/call/class expression can be inspected directly.
 */
function unwrapExpression(
  expr: TSESTree.Expression | null | undefined,
): TSESTree.Expression | null {
  let node: TSESTree.Expression | null | undefined = expr;
  while (
    node &&
    (node.type === AST_NODE_TYPES.TSAsExpression ||
      node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      node.type === AST_NODE_TYPES.TSNonNullExpression ||
      node.type === AST_NODE_TYPES.TSTypeAssertion ||
      (node as { type: string }).type === 'ParenthesizedExpression')
  ) {
    node = (node as unknown as { expression?: TSESTree.Expression }).expression;
  }
  return node ?? null;
}

function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

/**
 * Resolves a call's callee to a dotted name (`memo`, `React.memo`, ...). Returns
 * undefined for callees that are not a plain identifier or `a.b` member access
 * (e.g. a curried `connect(x)(Y)` where the callee is itself a call).
 */
function getCalleeName(
  callee: TSESTree.LeftHandSideExpression,
): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return `${callee.object.name}.${callee.property.name}`;
  }
  return undefined;
}

/**
 * True when a generic (non-`memo`/`forwardRef`) HOC call is applied to something
 * component-like: an inline JSX-returning function, or a PascalCase identifier
 * (a component reference such as `withDatePickerEdit(DatePicker)`). Recurses
 * through nested call arguments but never into function bodies.
 */
function callHasComponentArgument(call: TSESTree.CallExpression): boolean {
  for (const arg of call.arguments) {
    if (arg.type === AST_NODE_TYPES.SpreadElement) continue;
    const inner = unwrapExpression(arg as TSESTree.Expression);
    if (!inner) continue;
    if (isFunctionNode(inner) && ASTHelpers.returnsJSX(inner)) {
      return true;
    }
    if (
      inner.type === AST_NODE_TYPES.Identifier &&
      isComponentName(inner.name)
    ) {
      return true;
    }
    if (
      inner.type === AST_NODE_TYPES.CallExpression &&
      callHasComponentArgument(inner)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when a call expression produces a React component: a known React wrapper
 * (`memo`/`forwardRef`), or a generic HOC applied to a component-like argument.
 * Known non-component factories (`createContext`) are excluded up front.
 */
function callProducesComponent(call: TSESTree.CallExpression): boolean {
  const calleeName = getCalleeName(call.callee);
  if (calleeName && NON_COMPONENT_FACTORIES.has(calleeName)) {
    return false;
  }
  if (calleeName && REACT_COMPONENT_WRAPPERS.has(calleeName)) {
    return true;
  }
  return callHasComponentArgument(call);
}

function getSuperClassName(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): string | undefined {
  const superClass = node.superClass;
  if (!superClass) return undefined;
  if (superClass.type === AST_NODE_TYPES.Identifier) {
    return superClass.name;
  }
  if (
    superClass.type === AST_NODE_TYPES.MemberExpression &&
    !superClass.computed &&
    superClass.object.type === AST_NODE_TYPES.Identifier &&
    superClass.property.type === AST_NODE_TYPES.Identifier
  ) {
    return `${superClass.object.name}.${superClass.property.name}`;
  }
  return undefined;
}

function classifyClass(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): Classification {
  const superName = getSuperClassName(node);
  if (superName && REACT_COMPONENT_BASES.has(superName)) {
    return 'component';
  }
  return 'class';
}

/**
 * Classifies an initializer/expression. `name` is the binding name for the
 * PascalCase gate, or null for anonymous default exports (which bypass the gate
 * because they are inherently the file's primary export).
 */
function classifyExpression(
  expr: TSESTree.Expression | null | undefined,
  name: string | null,
): Classification {
  const inner = unwrapExpression(expr);
  if (!inner) return 'neither';

  const nameOk = name === null ? true : isComponentName(name);

  if (isFunctionNode(inner)) {
    return nameOk && ASTHelpers.returnsJSX(inner) ? 'component' : 'neither';
  }
  if (inner.type === AST_NODE_TYPES.ClassExpression) {
    return classifyClass(inner);
  }
  if (inner.type === AST_NODE_TYPES.CallExpression) {
    if (!nameOk) return 'neither';
    return callProducesComponent(inner) ? 'component' : 'neither';
  }
  return 'neither';
}

/**
 * Collects identifier names referenced as (recursive) call arguments — the basis
 * of the derived-wrapper collapse. Nested call arguments are followed
 * (`memo(forwardRef(X))`), but function bodies are never entered (rendering a
 * sibling in JSX is not deriving from it).
 */
function collectCallArgumentIdentifiers(
  call: TSESTree.CallExpression,
): string[] {
  const ids: string[] = [];
  for (const arg of call.arguments) {
    if (arg.type === AST_NODE_TYPES.SpreadElement) continue;
    const inner = unwrapExpression(arg as TSESTree.Expression);
    if (!inner) continue;
    if (inner.type === AST_NODE_TYPES.Identifier) {
      ids.push(inner.name);
    } else if (inner.type === AST_NODE_TYPES.CallExpression) {
      ids.push(...collectCallArgumentIdentifiers(inner));
    }
  }
  return ids;
}

/**
 * True when a class body has no member other than a constructor (an empty body
 * qualifies vacuously). Any property, getter/setter, method, index signature, or
 * static block disqualifies it — that is a real abstraction, not a trivial
 * subclass. Purely syntactic per Edge Case 6.
 */
function isConstructorOnlyClass(node: TSESTree.ClassDeclaration): boolean {
  return node.body.body.every(
    (member) =>
      member.type === AST_NODE_TYPES.MethodDefinition &&
      member.kind === 'constructor',
  );
}

type Unit = {
  id: string;
  name: string;
  node: TSESTree.Node;
  classification: Classification;
  callArgIdentifiers: string[];
};

export const enforceSingleExportedUnitPerFile = createRule<[], MessageIds>({
  name: 'enforce-single-exported-unit-per-file',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that a .tsx/.jsx file exports at most one React component and any file exports at most one class',
      recommended: 'error',
    },
    schema: [],
    messages: {
      multipleExportedComponents:
        'File exports {{count}} React components ({{names}}). Limit each .tsx file to one exported component: extract "{{name}}" into its own file, or parameterize sibling variants into a single component.',
      multipleExportedClasses:
        'File exports {{count}} classes ({{names}}). Limit each file to one exported class: extract "{{name}}" into its own file.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();
    if (isExemptFile(filename)) return {};

    const ext = path.extname(filename);
    const isComponentFile = ext === '.tsx' || ext === '.jsx';

    // All top-level class declarations by name — used for in-file base-chain
    // resolution in the error-hierarchy exemption (a base need not be exported).
    const allClassDecls = new Map<string, TSESTree.ClassDeclaration>();

    type DeclInfo = {
      name: string;
      node: TSESTree.Node;
      kind: 'class' | 'function' | 'variable';
      classNode?: TSESTree.ClassDeclaration;
      fnNode?: TSESTree.FunctionDeclaration;
      init?: TSESTree.Expression | null;
    };

    const declByName = new Map<string, DeclInfo>();
    const exportedNames = new Set<string>();
    const anonymousDefaults: Array<{
      node: TSESTree.Node;
      fnNode?: FunctionNode;
      classNode?: TSESTree.ClassExpression;
      expr?: TSESTree.Expression;
    }> = [];

    function isTopLevel(node: TSESTree.Node): boolean {
      const parent = node.parent;
      return (
        parent?.type === AST_NODE_TYPES.Program ||
        parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration
      );
    }

    function isExportedParent(node: TSESTree.Node): boolean {
      const parent = node.parent;
      return (
        parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration
      );
    }

    return {
      ClassDeclaration(node: TSESTree.ClassDeclaration) {
        if (!isTopLevel(node) || !node.id) return;
        const name = node.id.name;
        allClassDecls.set(name, node);
        declByName.set(name, { name, node, kind: 'class', classNode: node });
        if (isExportedParent(node)) exportedNames.add(name);
      },

      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (!isTopLevel(node) || !node.id) return;
        const name = node.id.name;
        declByName.set(name, { name, node, kind: 'function', fnNode: node });
        if (isExportedParent(node)) exportedNames.add(name);
      },

      VariableDeclaration(node: TSESTree.VariableDeclaration) {
        const parent = node.parent;
        const topLevel =
          parent?.type === AST_NODE_TYPES.Program ||
          parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
        if (!topLevel) return;
        const exported = parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;
        for (const declarator of node.declarations) {
          if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;
          const name = declarator.id.name;
          declByName.set(name, {
            name,
            node: declarator,
            kind: 'variable',
            init: declarator.init,
          });
          if (exported) exportedNames.add(name);
        }
      },

      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        // `export { X } from './x'` / `export * from` re-surface declarations
        // from other files — zero new units here.
        if (node.source) return;
        if (node.declaration) return;
        for (const specifier of node.specifiers) {
          if (specifier.local.type === AST_NODE_TYPES.Identifier) {
            exportedNames.add(specifier.local.name);
          }
        }
      },

      ExportDefaultDeclaration(node: TSESTree.ExportDefaultDeclaration) {
        const decl = node.declaration;
        if (decl.type === AST_NODE_TYPES.Identifier) {
          exportedNames.add(decl.name);
          return;
        }
        if (
          decl.type === AST_NODE_TYPES.FunctionDeclaration ||
          decl.type === AST_NODE_TYPES.ClassDeclaration
        ) {
          // Named default declarations are collected by their own visitors;
          // only anonymous ones need a synthetic unit here.
          if (!decl.id) {
            if (decl.type === AST_NODE_TYPES.FunctionDeclaration) {
              anonymousDefaults.push({ node, fnNode: decl });
            }
          }
          return;
        }
        if (decl.type === AST_NODE_TYPES.ClassExpression) {
          anonymousDefaults.push({ node, classNode: decl });
          return;
        }
        anonymousDefaults.push({ node, expr: decl as TSESTree.Expression });
      },

      'Program:exit'() {
        const units: Unit[] = [];

        for (const name of exportedNames) {
          const decl = declByName.get(name);
          if (!decl) continue;
          let classification: Classification = 'neither';
          let callArgIdentifiers: string[] = [];
          if (decl.kind === 'class' && decl.classNode) {
            classification = classifyClass(decl.classNode);
          } else if (decl.kind === 'function' && decl.fnNode) {
            classification =
              isComponentName(name) && ASTHelpers.returnsJSX(decl.fnNode)
                ? 'component'
                : 'neither';
          } else {
            classification = classifyExpression(decl.init, name);
            const inner = unwrapExpression(decl.init);
            // Only a derived COMPONENT wrapper collapses into its source; a
            // non-component call (a factory, config builder) never does.
            if (
              classification === 'component' &&
              inner &&
              inner.type === AST_NODE_TYPES.CallExpression
            ) {
              callArgIdentifiers = collectCallArgumentIdentifiers(inner);
            }
          }
          units.push({
            id: name,
            name,
            node: decl.node,
            classification,
            callArgIdentifiers,
          });
        }

        let anonIndex = 0;
        for (const anon of anonymousDefaults) {
          let classification: Classification = 'neither';
          let callArgIdentifiers: string[] = [];
          if (anon.fnNode) {
            classification = ASTHelpers.returnsJSX(anon.fnNode)
              ? 'component'
              : 'neither';
          } else if (anon.classNode) {
            classification = classifyClass(anon.classNode);
          } else if (anon.expr) {
            classification = classifyExpression(anon.expr, null);
            const inner = unwrapExpression(anon.expr);
            if (
              classification === 'component' &&
              inner &&
              inner.type === AST_NODE_TYPES.CallExpression
            ) {
              callArgIdentifiers = collectCallArgumentIdentifiers(inner);
            }
          }
          units.push({
            id: `\0default${anonIndex++}`,
            name: 'default',
            node: anon.node,
            classification,
            callArgIdentifiers,
          });
        }

        if (units.length === 0) return;

        // Union-find over units for the derived-wrapper collapse.
        const parent = new Map<string, string>();
        for (const unit of units) parent.set(unit.id, unit.id);
        const find = (id: string): string => {
          let root = id;
          let next = parent.get(root) ?? root;
          while (next !== root) {
            root = next;
            next = parent.get(root) ?? root;
          }
          let cur = id;
          let curParent = parent.get(cur) ?? cur;
          while (curParent !== root) {
            parent.set(cur, root);
            cur = curParent;
            curParent = parent.get(cur) ?? cur;
          }
          return root;
        };
        const union = (a: string, b: string): void => {
          const ra = find(a);
          const rb = find(b);
          if (ra !== rb) parent.set(ra, rb);
        };

        const unitIds = new Set(units.map((u) => u.id));
        for (const unit of units) {
          for (const refName of unit.callArgIdentifiers) {
            if (refName !== unit.id && unitIds.has(refName)) {
              union(unit.id, refName);
            }
          }
        }

        // Group units into their collapsed representation.
        const groupsMap = new Map<string, Unit[]>();
        for (const unit of units) {
          const root = find(unit.id);
          const members = groupsMap.get(root) ?? [];
          members.push(unit);
          groupsMap.set(root, members);
        }

        type Group = {
          classification: Classification;
          repName: string;
          repNode: TSESTree.Node;
          position: number;
          classNodes: TSESTree.ClassDeclaration[];
        };

        const groups: Group[] = [];
        for (const members of groupsMap.values()) {
          const classification: Classification = members.some(
            (m) => m.classification === 'component',
          )
            ? 'component'
            : members.some((m) => m.classification === 'class')
            ? 'class'
            : 'neither';

          // Representative: the last-declared member (by convention the public
          // wrapper, e.g. `Logo` over `LogoUnmemoized`).
          const rep = members.reduce((latest, m) =>
            m.node.range[0] > latest.node.range[0] ? m : latest,
          );

          const classNodes: TSESTree.ClassDeclaration[] = [];
          for (const m of members) {
            const decl = declByName.get(m.id);
            if (decl?.kind === 'class' && decl.classNode) {
              classNodes.push(decl.classNode);
            }
          }

          groups.push({
            classification,
            repName: rep.name,
            repNode: rep.node,
            position: rep.node.range[0],
            classNodes,
          });
        }

        const componentGroups = groups
          .filter((g) => g.classification === 'component')
          .sort((a, b) => a.position - b.position);
        const classGroups = groups
          .filter((g) => g.classification === 'class')
          .sort((a, b) => a.position - b.position);

        if (isComponentFile && componentGroups.length >= 2) {
          const names = componentGroups.map((g) => g.repName).join(', ');
          for (const group of componentGroups.slice(1)) {
            context.report({
              node: group.repNode,
              messageId: 'multipleExportedComponents',
              data: {
                count: componentGroups.length,
                names,
                name: group.repName,
              },
            });
          }
        }

        if (classGroups.length >= 2) {
          const exportedClassNodes = classGroups.flatMap((g) => g.classNodes);
          if (!isExemptErrorHierarchy(exportedClassNodes, allClassDecls)) {
            const names = classGroups.map((g) => g.repName).join(', ');
            for (const group of classGroups.slice(1)) {
              context.report({
                node: group.repNode,
                messageId: 'multipleExportedClasses',
                data: {
                  count: classGroups.length,
                  names,
                  name: group.repName,
                },
              });
            }
          }
        }
      },
    };
  },
});

/**
 * Resolves a class's terminal base by walking up the extends-chain through
 * classes declared in the same file. Returns the first imported/global base
 * name, or the topmost in-file class's own name when the chain ends without a
 * superclass (making an in-file hierarchy root its own common base).
 */
function rootBaseOf(
  node: TSESTree.ClassDeclaration,
  allClassDecls: Map<string, TSESTree.ClassDeclaration>,
): string | undefined {
  let current: TSESTree.ClassDeclaration = node;
  const seen = new Set<string>();
  for (;;) {
    const superName = getSuperClassName(current);
    if (!superName) {
      return current.id ? current.id.name : undefined;
    }
    const superDecl = allClassDecls.get(superName);
    if (superDecl && !seen.has(superName)) {
      seen.add(superName);
      current = superDecl;
      continue;
    }
    return superName;
  }
}

/**
 * Edge Case 6: a multi-class file is exempt when every exported class is a
 * trivial constructor-only subclass AND they all share a common base (the same
 * imported identifier, or a hierarchy rooted at one in-file class).
 */
function isExemptErrorHierarchy(
  classNodes: TSESTree.ClassDeclaration[],
  allClassDecls: Map<string, TSESTree.ClassDeclaration>,
): boolean {
  if (classNodes.length < 2) return false;
  if (!classNodes.every((node) => isConstructorOnlyClass(node))) {
    return false;
  }
  const roots = classNodes.map((node) => rootBaseOf(node, allClassDecls));
  if (roots.some((root) => root === undefined)) return false;
  return roots.every((root) => root === roots[0]);
}
