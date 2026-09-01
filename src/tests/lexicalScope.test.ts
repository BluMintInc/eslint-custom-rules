import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as parser from '@typescript-eslint/parser';
import {
  BindingNamespace,
  bindsNameOutsideStatements,
  BOUND_UNPROVABLE,
  declarationOf,
  enclosingStatementLists,
  resolveInEnclosingScopes,
  resolveNameInEnclosingScopes,
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

describe('bindsNameOutsideStatements', () => {
  /**
   * Every binder listed here is one `statementsOf` cannot report, so each row is
   * a scope the plain walk steps straight past (#2257).
   */
  it.each([
    [
      'function type parameter',
      'function f<Taken>() {}',
      AST_NODE_TYPES.FunctionDeclaration,
      'type',
    ],
    [
      'class type parameter',
      'class C<Taken> {}',
      AST_NODE_TYPES.ClassDeclaration,
      'type',
    ],
    [
      'type alias type parameter',
      'type A<Taken> = Taken;',
      AST_NODE_TYPES.TSTypeAliasDeclaration,
      'type',
    ],
    [
      'interface type parameter',
      'interface I<Taken> { x: Taken }',
      AST_NODE_TYPES.TSInterfaceDeclaration,
      'type',
    ],
    [
      'class expression name',
      'const C = class Taken {};',
      AST_NODE_TYPES.ClassExpression,
      'type',
    ],
    [
      'function parameter',
      'function f(Taken) {}',
      AST_NODE_TYPES.FunctionDeclaration,
      'value',
    ],
    [
      'destructured parameter',
      'function f({ a: { Taken } }) {}',
      AST_NODE_TYPES.FunctionDeclaration,
      'value',
    ],
    [
      'rest parameter',
      'function f(...Taken) {}',
      AST_NODE_TYPES.FunctionDeclaration,
      'value',
    ],
    [
      'defaulted parameter',
      'function f(Taken = 1) {}',
      AST_NODE_TYPES.FunctionDeclaration,
      'value',
    ],
    [
      'arrow parameter',
      'const f = (Taken) => Taken;',
      AST_NODE_TYPES.ArrowFunctionExpression,
      'value',
    ],
    [
      'function expression name',
      'const f = function Taken() {};',
      AST_NODE_TYPES.FunctionExpression,
      'value',
    ],
    [
      'catch parameter',
      'try {} catch (Taken) {}',
      AST_NODE_TYPES.CatchClause,
      'value',
    ],
    [
      'for-of head',
      'for (const Taken of xs) {}',
      AST_NODE_TYPES.ForOfStatement,
      'value',
    ],
    [
      'for-in head',
      'for (const Taken in xs) {}',
      AST_NODE_TYPES.ForInStatement,
      'value',
    ],
    [
      'classic for head',
      'for (let Taken = 0; ; ) {}',
      AST_NODE_TYPES.ForStatement,
      'value',
    ],
  ])(
    'reports a %s as binding the name',
    (_label, code, containerType, namespace) => {
      const container = findNode(parse(code), containerType as AST_NODE_TYPES);
      expect(
        bindsNameOutsideStatements(
          container,
          'Taken',
          namespace as BindingNamespace,
        ),
      ).toBe(true);
    },
  );

  /**
   * The two declaration spaces are tested separately because conflating them
   * converts a resolution hole into an over-decline: `function f(Props) {}`
   * leaves `type Props` perfectly resolvable inside `f`.
   */
  it('keeps the type and value spaces separate', () => {
    const typeParam = parse('function f<Props>() {}').body[0];
    expect(bindsNameOutsideStatements(typeParam, 'Props', 'type')).toBe(true);
    expect(bindsNameOutsideStatements(typeParam, 'Props', 'value')).toBe(false);

    const valueParam = parse('function f(Props) {}').body[0];
    expect(bindsNameOutsideStatements(valueParam, 'Props', 'value')).toBe(true);
    expect(bindsNameOutsideStatements(valueParam, 'Props', 'type')).toBe(false);
  });

  /**
   * `typeParameters` is the declaration that binds `<T>` on one node kind and
   * the arguments supplied at a call site on another. The second holds type
   * nodes with no `name`, so conflating them throws rather than answering.
   */
  it.each([
    ['call', 'useState<Taken>(null);', AST_NODE_TYPES.CallExpression],
    ['type reference', 'type B = Wrapper<Taken>;', AST_NODE_TYPES.TSTypeReference],
    ['new', 'new Map<Taken, Taken>();', AST_NODE_TYPES.NewExpression],
    [
      'instantiation expression',
      'const d = fn<Taken>;',
      AST_NODE_TYPES.TSInstantiationExpression,
    ],
  ])('treats a %s type ARGUMENT as binding nothing', (_label, code, type) => {
    const container = findNode(parse(code), type as AST_NODE_TYPES);
    expect(bindsNameOutsideStatements(container, 'Taken', 'type')).toBe(false);
    expect(bindsNameOutsideStatements(container, 'Taken', 'value')).toBe(false);
  });

  it('reports nothing for a container binding a different name', () => {
    const program = parse('function f<Other>(other) {}');
    expect(bindsNameOutsideStatements(program.body[0], 'Taken', 'type')).toBe(
      false,
    );
    expect(bindsNameOutsideStatements(program.body[0], 'Taken', 'value')).toBe(
      false,
    );
  });
});

describe('resolveNameInEnclosingScopes', () => {
  it('stops at a type parameter shadowing the outer declaration', () => {
    const program = parse(`
      type Target = 1;
      function host<Target>() {
        const marker = 1;
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);

    // The plain walk cannot see the type parameter, so the outer alias answers.
    expect(resolveInEnclosingScopes(marker, aliasNamed('Target'))).toBe(
      declarationOf(program.body[0]),
    );
    expect(
      resolveNameInEnclosingScopes(marker, 'Target', 'type', aliasNamed('Target')),
    ).toBeUndefined();
  });

  it('suppresses the fallback behind a shadow', () => {
    const program = parse(`
      function host<Target>() {
        const marker = 1;
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);
    const fallback = jest.fn(() => ({ from: 'fallback' } as never));

    // The fallback describes the file's top level, which the reference cannot
    // reach past the shadow — the same reasoning BOUND_UNPROVABLE encodes.
    expect(
      resolveNameInEnclosingScopes(
        marker,
        'Target',
        'type',
        aliasNamed('Target'),
        fallback,
      ),
    ).toBeUndefined();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('prefers a declaration the shadowing container itself holds', () => {
    const program = parse(`
      type Target = 1;
      function host<Target>() {
        type Target = 2;
        const marker = 1;
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);
    const inner = findNode<TSESTree.TSTypeAliasDeclaration>(
      findNode(program, AST_NODE_TYPES.BlockStatement),
      AST_NODE_TYPES.TSTypeAliasDeclaration,
    );

    expect(
      resolveNameInEnclosingScopes(marker, 'Target', 'type', aliasNamed('Target')),
    ).toBe(inner);
  });

  it('resolves normally when no binder shadows the name', () => {
    const program = parse(`
      type Target = 1;
      function host<Other>() {
        const marker = 1;
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);

    expect(
      resolveNameInEnclosingScopes(marker, 'Target', 'type', aliasNamed('Target')),
    ).toBe(declarationOf(program.body[0]));
  });

  it('ignores a value binder when resolving a type name', () => {
    const program = parse(`
      type Target = 1;
      function host(Target) {
        const marker = 1;
      }
    `);
    const marker = findNode(program, AST_NODE_TYPES.VariableDeclarator);

    expect(
      resolveNameInEnclosingScopes(marker, 'Target', 'type', aliasNamed('Target')),
    ).toBe(declarationOf(program.body[0]));
  });
});
