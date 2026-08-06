import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as parser from '@typescript-eslint/parser';
import {
  BOUND_UNPROVABLE,
  declarationOf,
  enclosingStatementLists,
  resolveInEnclosingScopes,
  ScopeMatch,
  statementsOf,
} from '../utils/lexicalScope';

/**
 * The helper is exercised on a real parse rather than on hand-built nodes,
 * because the shape of the containers it reads is exactly what a synthetic
 * fixture would have to fake.
 *
 * Parent pointers are assigned here because the parser does not set them —
 * ESLint's own traverser does, as it walks a rule's visitors — and the whole
 * point of this helper is the chain it climbs.
 */
function parse(code: string): TSESTree.Program {
  const { ast } = parser.parseForESLint(code, {
    ecmaVersion: 2022,
    sourceType: 'module',
    range: true,
    loc: true,
    filePath: 'file.ts',
  });
  const program = ast as unknown as TSESTree.Program;
  const assignParents = (node: TSESTree.Node) => {
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === 'object' && 'type' in child) {
          (child as TSESTree.Node).parent = node;
          assignParents(child as TSESTree.Node);
        }
      }
    }
  };
  assignParents(program);
  return program;
}

/** The first node of the given type, in document order. */
function findNode<T extends TSESTree.Node>(
  root: TSESTree.Node,
  type: AST_NODE_TYPES,
  predicate: (node: T) => boolean = () => true,
): T {
  const stack: TSESTree.Node[] = [root];
  while (stack.length) {
    const node = stack.shift() as TSESTree.Node;
    if (node.type === type && predicate(node as T)) {
      return node as T;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && 'type' in child) {
            stack.push(child as TSESTree.Node);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        stack.push(value as TSESTree.Node);
      }
    }
  }
  throw new Error(`no ${type} in fixture`);
}

const aliasNamed =
  (name: string) =>
  (statements: readonly TSESTree.Node[]): ScopeMatch<TSESTree.Node> => {
    for (const statement of statements) {
      const declaration = declarationOf(statement);
      if (
        declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
        declaration.id.name === name
      ) {
        return declaration;
      }
    }
    return undefined;
  };

describe('statementsOf', () => {
  it('yields the body of every container a declaration can sit in', () => {
    const program = parse(`
      namespace Space { type InModule = 1; }
      function outer() { type InBlock = 2; }
      class Holder { static { type InStatic = 3; } }
      function sw(kind: string) {
        switch (kind) {
          case 'a':
            type InCase = 4;
            break;
        }
      }
    `);

    expect(statementsOf(program)).toBe(program.body);
    for (const type of [
      AST_NODE_TYPES.TSModuleBlock,
      AST_NODE_TYPES.BlockStatement,
      AST_NODE_TYPES.StaticBlock,
    ]) {
      const container = findNode(program, type);
      expect(statementsOf(container)).toBe(
        (container as unknown as { body: TSESTree.Node[] }).body,
      );
    }

    const switchCase = findNode<TSESTree.SwitchCase>(
      program,
      AST_NODE_TYPES.SwitchCase,
    );
    expect(statementsOf(switchCase)).toBe(switchCase.consequent);
  });

  it('yields undefined for a node holding no statement list', () => {
    const program = parse('const x = { a: 1 };');
    const object = findNode(program, AST_NODE_TYPES.ObjectExpression);
    expect(statementsOf(object)).toBeUndefined();
    expect(statementsOf(program.body[0])).toBeUndefined();
  });
});

describe('declarationOf', () => {
  it('looks through a named export to the declaration it carries', () => {
    const program = parse('export type Wrapped = 1;');
    expect(declarationOf(program.body[0]).type).toBe(
      AST_NODE_TYPES.TSTypeAliasDeclaration,
    );
  });

  it('looks through a default export', () => {
    const program = parse('export default function named() {}');
    expect(declarationOf(program.body[0]).type).toBe(
      AST_NODE_TYPES.FunctionDeclaration,
    );
  });

  it('returns a specifier-only export unchanged', () => {
    // `export { X }` names a declaration made elsewhere — possibly in a third
    // module — so there is nothing to unwrap and the statement stands.
    const program = parse('const X = 1;\nexport { X };');
    expect(declarationOf(program.body[1]).type).toBe(
      AST_NODE_TYPES.ExportNamedDeclaration,
    );
  });

  it('returns an ordinary statement unchanged', () => {
    const program = parse('type Plain = 1;');
    expect(declarationOf(program.body[0])).toBe(program.body[0]);
  });
});

describe('resolveInEnclosingScopes', () => {
  it('lets the innermost declaration shadow a same-named outer one', () => {
    const program = parse(`
      type Target = 'outer';
      function host() {
        type Target = 'inner';
        const marker = 1;
      }
    `);
    const marker = findNode<TSESTree.VariableDeclarator>(
      program,
      AST_NODE_TYPES.VariableDeclarator,
      (node) =>
        node.id.type === AST_NODE_TYPES.Identifier && node.id.name === 'marker',
    );

    const resolved = resolveInEnclosingScopes(marker, aliasNamed('Target'));
    const literal = (resolved as TSESTree.TSTypeAliasDeclaration)
      .typeAnnotation as TSESTree.TSLiteralType;
    expect((literal.literal as TSESTree.Literal).value).toBe('inner');
  });

  it('resolves a declaration written below its own reference', () => {
    // Type declarations hoist, so every statement of a container is searched
    // rather than only those preceding the reference.
    const program = parse(`
      function host() {
        const marker = 1;
        type Target = 'below';
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);
    expect(
      resolveInEnclosingScopes(marker, aliasNamed('Target')),
    ).toBeDefined();
  });

  it('reaches a declaration through an export wrapper and a namespace', () => {
    const program = parse(`
      namespace Space {
        export type Target = 'exported';
        export const marker = 1;
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);
    expect(
      resolveInEnclosingScopes(marker, aliasNamed('Target')),
    ).toBeDefined();
  });

  it('consults the fallback only when the lexical walk finds nothing', () => {
    const program = parse(`
      type Target = 'lexical';
      const marker = 1;
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);

    const fallback = jest.fn(() => ({ from: 'fallback' } as never));
    expect(
      resolveInEnclosingScopes(marker, aliasNamed('Target'), fallback),
    ).toBeDefined();
    expect(fallback).not.toHaveBeenCalled();

    expect(
      resolveInEnclosingScopes(marker, aliasNamed('Absent'), fallback),
    ).toEqual({ from: 'fallback' });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('resolves through the fallback when the node carries no parent chain', () => {
    // A sibling module parsed for a cross-file hop has no parent pointers, so
    // the walk ends immediately and only the fallback can answer (#1644).
    const sibling = parser.parse('type Target = 1;', {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
    }) as unknown as TSESTree.Program;
    const orphan = sibling.body[0];
    expect(orphan.parent).toBeUndefined();

    expect(
      resolveInEnclosingScopes(orphan, aliasNamed('Target'), () =>
        aliasNamed('Target')(sibling.body),
      ),
    ).toBeDefined();
  });

  it('stops at a binding that proves nothing, without reaching past it', () => {
    const program = parse(`
      type Target = 'outer';
      function host() {
        type Target = 'inner';
        const marker = 1;
      }
    `);
    const marker = findNode<TSESTree.VariableDeclarator>(
      program,
      AST_NODE_TYPES.VariableDeclarator,
      (node) =>
        node.id.type === AST_NODE_TYPES.Identifier && node.id.name === 'marker',
    );

    const fallback = jest.fn(() => ({ from: 'fallback' } as never));
    const shadowing = (
      statements: readonly TSESTree.Node[],
    ): ScopeMatch<TSESTree.Node> =>
      aliasNamed('Target')(statements) ? BOUND_UNPROVABLE : undefined;

    // The inner declaration binds the name without yielding an answer: neither
    // the outer declaration nor the fallback may answer in its place.
    expect(
      resolveInEnclosingScopes(marker, shadowing, fallback),
    ).toBeUndefined();
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe('enclosingStatementLists', () => {
  it('collects every enclosing container innermost outward', () => {
    const program = parse(`
      namespace Space {
        function host() {
          const marker = 1;
        }
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);
    const lists = enclosingStatementLists(marker);

    const blockBody = findNode<TSESTree.BlockStatement>(
      program,
      AST_NODE_TYPES.BlockStatement,
    ).body;
    const moduleBody = findNode<TSESTree.TSModuleBlock>(
      program,
      AST_NODE_TYPES.TSModuleBlock,
    ).body;

    expect(lists).toEqual([blockBody, moduleBody, program.body]);
  });
});
