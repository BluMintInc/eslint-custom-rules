import fs from 'fs';
import path from 'path';
import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';

type MessageIds = 'preferSpread';

type Options = [{ minFields?: number }];

const DEFAULT_MIN_FIELDS = 2;

/**
 * Collects all identifier references (not declarations) used anywhere in a
 * subtree. Used to detect when a destructured binding is consumed for purposes
 * other than being forwarded directly.
 */
function collectIdentifierUses(node: TSESTree.Node, names: Set<string>): void {
  if (node.type === AST_NODE_TYPES.Identifier) {
    names.add(node.name);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          collectIdentifierUses(child as TSESTree.Node, names);
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      collectIdentifierUses(value as TSESTree.Node, names);
    }
  }
}

/**
 * Returns the names of the simple (non-renamed, no default, top-level)
 * destructured properties in an ObjectPattern, or null if the pattern has any
 * feature that makes spread replacement unsafe (rest elements, default values,
 * renamed bindings, nested patterns, computed keys).
 */
function getSimpleDestructuredNames(
  pattern: TSESTree.ObjectPattern,
): string[] | null {
  const names: string[] = [];
  for (const prop of pattern.properties) {
    // Rest element — the developer explicitly chose to separate props.
    if (prop.type === AST_NODE_TYPES.RestElement) {
      return null;
    }
    if (prop.type !== AST_NODE_TYPES.Property) {
      return null;
    }
    // Computed key — cannot determine the name statically.
    if (prop.computed) {
      return null;
    }
    // Renamed binding: { a: b } — would change semantics.
    if (!prop.shorthand) {
      return null;
    }
    // Default value: { a = 1 } — spread would bypass the default.
    if (prop.value.type === AST_NODE_TYPES.AssignmentPattern) {
      return null;
    }
    // Nested destructuring: { a: { b } } — not top-level.
    if (
      prop.value.type === AST_NODE_TYPES.ObjectPattern ||
      prop.value.type === AST_NODE_TYPES.ArrayPattern
    ) {
      return null;
    }
    if (prop.value.type !== AST_NODE_TYPES.Identifier) {
      return null;
    }
    names.push(prop.value.name);
  }
  return names;
}

/**
 * Array methods that hand each element of the receiver to their callback. They
 * are the contextual route by which an unannotated destructured parameter still
 * has a knowable type: the element type of the array being iterated.
 */
const ELEMENT_CALLBACK_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'flatMap',
]);

const ARRAY_TYPE_NAMES = new Set(['Array', 'ReadonlyArray']);

/**
 * Type operators that are homomorphic over their argument: each one rewrites
 * the modifiers of every member and leaves the key set identical, so a member
 * list read through them describes the wrapped type exactly. `Readonly<{...}>`
 * is the idiomatic spelling of a data record, and refusing to see through it
 * makes the narrowing proof inert on the code it exists to protect (#1643).
 *
 * `Pick`, `Omit`, `Record`, `Exclude` and `Extract` are deliberately absent:
 * they rewrite the key set, and a wrong proof silences a report the rule owes
 * rather than merely failing to find one.
 */
const KEY_PRESERVING_TYPE_OPERATORS = new Set([
  'Readonly',
  'Required',
  'Partial',
]);

/**
 * Collects every name the file itself binds in a way that can stand in front of
 * a type argument list — a type alias, an interface, a class, an enum, a
 * namespace or an import. A file spelling `Readonly` as one of these is talking
 * about its own declaration rather than the lib utility, so the key-preserving
 * unwrap must not apply to it.
 *
 * The walk covers nested declarations too, since a `type Partial<T>` inside a
 * function body shadows the global just as effectively as a top-level one.
 */
function collectLocallyBoundNames(
  node: TSESTree.Node,
  names: Set<string>,
): void {
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeAliasDeclaration:
    case AST_NODE_TYPES.TSInterfaceDeclaration:
    case AST_NODE_TYPES.TSEnumDeclaration:
    case AST_NODE_TYPES.TSImportEqualsDeclaration:
      names.add(node.id.name);
      break;
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.ClassExpression:
      if (node.id) {
        names.add(node.id.name);
      }
      break;
    case AST_NODE_TYPES.TSModuleDeclaration:
      if (node.id.type === AST_NODE_TYPES.Identifier) {
        names.add(node.id.name);
      }
      break;
    case AST_NODE_TYPES.ImportSpecifier:
    case AST_NODE_TYPES.ImportDefaultSpecifier:
    case AST_NODE_TYPES.ImportNamespaceSpecifier:
      names.add(node.local.name);
      break;
    default:
      break;
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          collectLocallyBoundNames(child as TSESTree.Node, names);
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      collectLocallyBoundNames(value as TSESTree.Node, names);
    }
  }
}

/**
 * What member enumeration needs to know about the file it is reading: the
 * program a same-file alias falls back to when the reference carries no lexical
 * chain to walk, and whether a name is bound by that file itself, which decides
 * whether `Readonly<T>` names the lib utility or the author's own declaration.
 *
 * `resolveImportedMembers` is the single hop off the file. It is present only on
 * the scope of the file under lint; the scope built for a sibling module leaves
 * it undefined, which is what stops the walk after one module.
 */
type TypeResolutionScope = {
  program: TSESTree.Program;
  isLocallyBound: (name: string) => boolean;
  resolveImportedMembers?: (name: string) => Set<string> | null;
};

/**
 * Resolves `Promise<T>` to `T`, leaving anything else as it stands, which is
 * what `await` does to the type of the expression it operates on.
 */
function unwrapPromise(typeNode: TSESTree.TypeNode): TSESTree.TypeNode {
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    typeNode.typeName.name === 'Promise' &&
    typeNode.typeParameters?.params.length === 1
  ) {
    return typeNode.typeParameters.params[0];
  }
  return typeNode;
}

/** The element type of an array type, or null when the type is not an array. */
function arrayElementTypeOf(
  typeNode: TSESTree.TypeNode,
): TSESTree.TypeNode | null {
  if (typeNode.type === AST_NODE_TYPES.TSArrayType) {
    return typeNode.elementType;
  }
  // `readonly Unit[]` wraps the array type in a type operator.
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeOperator &&
    typeNode.operator === 'readonly' &&
    typeNode.typeAnnotation
  ) {
    return arrayElementTypeOf(typeNode.typeAnnotation);
  }
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    ARRAY_TYPE_NAMES.has(typeNode.typeName.name) &&
    typeNode.typeParameters?.params.length === 1
  ) {
    return typeNode.typeParameters.params[0];
  }
  return null;
}

/**
 * The property names a member list declares, or null when the list cannot be
 * enumerated exactly. An index signature, a call/construct signature or a
 * computed key all describe members whose names are not written down, and a
 * member set that may be larger than what is read would let a narrowing pick
 * pass for an exhaustive one.
 */
function namesOfMembers(
  members: readonly TSESTree.TypeElement[],
): Set<string> | null {
  const names = new Set<string>();
  for (const member of members) {
    if (
      member.type !== AST_NODE_TYPES.TSPropertySignature &&
      member.type !== AST_NODE_TYPES.TSMethodSignature
    ) {
      return null;
    }
    if (member.computed) {
      return null;
    }
    const key = member.key;
    if (key.type === AST_NODE_TYPES.Identifier) {
      names.add(key.name);
    } else if (
      key.type === AST_NODE_TYPES.Literal &&
      typeof key.value === 'string'
    ) {
      names.add(key.value);
    } else {
      return null;
    }
  }
  return names;
}

type TypeDeclaration =
  | TSESTree.TSTypeAliasDeclaration
  | TSESTree.TSInterfaceDeclaration;

/**
 * The type declaration a statement carries, looking through `export`.
 *
 * `export type Wide = ...` is the same declaration one AST node deeper. Reading
 * the statement without unwrapping would let the `export` keyword alone decide
 * whether a type is resolvable, which says nothing about the shape it denotes.
 */
function typeDeclarationOf(statement: TSESTree.Node): TypeDeclaration | null {
  const declaration = declarationOf(statement);
  return declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
    declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration
    ? declaration
    : null;
}

function typeDeclarationIn(
  statements: readonly TSESTree.Node[],
  name: string,
): TypeDeclaration | null {
  for (const statement of statements) {
    const declaration = typeDeclarationOf(statement);
    if (declaration && declaration.id.name === name) {
      return declaration;
    }
  }
  return null;
}

/**
 * Finds the type alias or interface a name denotes at the point it is written,
 * searching every enclosing statement container innermost outward so the nearest
 * declaration shadows a same-named outer one — the resolution TypeScript itself
 * performs.
 *
 * A declaration in a function body, a bare block, a `namespace` or a `switch`
 * case binds its name just as effectively as a top-level one, which the rule
 * already asserts in {@link collectLocallyBoundNames}. Reading only
 * `Program.body` leaves every one of those unresolvable, and an unresolvable
 * type kills the narrowing-pick proof — turning a carve-out into a report whose
 * fix widens the payload (#1769).
 *
 * Every statement of a container is searched rather than only those preceding
 * the reference, matching TypeScript's hoisting of type declarations.
 *
 * `Program.body` is consulted as a fallback because a sibling module is parsed
 * without parent pointers, leaving its nodes with no chain to walk; a top-level
 * declaration is in scope from anywhere in its file, so the fallback can only
 * find what the walk would have.
 */
function findLocalTypeDeclaration(
  program: TSESTree.Program,
  from: TSESTree.Node,
  name: string,
): TypeDeclaration | null {
  return (
    resolveInEnclosingScopes<TypeDeclaration>(
      from,
      (statements) => typeDeclarationIn(statements, name) ?? undefined,
      () => typeDeclarationIn(program.body, name) ?? undefined,
    ) ?? null
  );
}

/**
 * Finds a type alias or interface a module exports by writing `export` in front
 * of the declaration itself.
 *
 * Only that spelling qualifies. `export { X }` and `export { X } from './y'` are
 * indistinguishable at the specifier — the second names a declaration in a third
 * module — and `export * from './y'` names no declaration at all, so following
 * either would be a guess rather than a proof.
 */
function findDirectlyExportedTypeDeclaration(
  program: TSESTree.Program,
  name: string,
): TypeDeclaration | null {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ExportNamedDeclaration ||
      !statement.declaration
    ) {
      continue;
    }
    const declaration = statement.declaration;
    if (
      (declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
        declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration) &&
      declaration.id.name === name
    ) {
      return declaration;
    }
  }
  return null;
}

const RELATIVE_SOURCE = /^\.\.?\//;

/**
 * A type declaration overwhelmingly lives in a `.ts` sibling, so that extension
 * is tried first; the rest follow a bundler's own order.
 */
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

type FileStamp = { mtimeMs: number; size: number };
type ResolvedModule = FileStamp & { filePath: string };
/** `members: null` records a module that proved nothing, which reports. */
type StampedMembers = FileStamp & { members: Set<string> | null };

/**
 * The resolution cache stores which path a specifier picks, never the file's
 * contents: a resolution *miss* is safe to keep because a module created later
 * stays unresolved, which reports. The member cache instead carries the resolved
 * file's stamp as its VALUE, so a sibling edited under a long-lived host (the VS
 * Code ESLint extension, eslint_d) is re-read rather than answered from a stale
 * member list — a stale list is what would silence a report the rule owes. The
 * stamp lives in the value so an edited file replaces its entry instead of
 * accumulating one per revision.
 */
const moduleResolutionCache = new Map<string, string | null>();
const importedMembersCache = new Map<string, StampedMembers>();

/**
 * Stat a candidate path, returning its identity stamp when it is a file. The
 * single stat both resolves existence and stamps the file, so reading a sibling
 * never pays for two.
 */
function statModule(candidate: string): ResolvedModule | null {
  try {
    const stats = fs.statSync(candidate);
    return stats.isFile()
      ? { filePath: candidate, mtimeMs: stats.mtimeMs, size: stats.size }
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a relative import specifier the way a bundler would: sibling file
 * first, then the directory's index file. Package specifiers never reach here —
 * a bare specifier names a module whose location depends on resolution settings
 * this rule does not read, so it proves nothing.
 */
function resolveRelativeModule(
  fromDir: string,
  source: string,
): ResolvedModule | null {
  const cacheKey = JSON.stringify([fromDir, source]);
  const cached = moduleResolutionCache.get(cacheKey);
  if (cached !== undefined) {
    return cached === null ? null : statModule(cached);
  }

  const base = path.resolve(fromDir, source);
  let resolved: ResolvedModule | null = null;
  for (const extension of MODULE_EXTENSIONS) {
    resolved = statModule(`${base}${extension}`);
    if (resolved) {
      break;
    }
  }
  if (!resolved) {
    for (const extension of MODULE_EXTENSIONS) {
      resolved = statModule(path.join(base, `index${extension}`));
      if (resolved) {
        break;
      }
    }
  }

  moduleResolutionCache.set(cacheKey, resolved?.filePath ?? null);
  return resolved;
}

type ForeignParseOptions = {
  jsx: boolean;
  loc: boolean;
  range: boolean;
  comment: boolean;
};

type ForeignParse = (
  source: string,
  options: ForeignParseOptions,
) => TSESTree.Program;

/**
 * `undefined` means the parser has not been looked up yet; `null` means the
 * lookup failed and must not be retried.
 */
let foreignParse: ForeignParse | null | undefined;

/**
 * The sibling module is read with the parser that backs
 * `@typescript-eslint/utils` itself, loaded lazily and memoized (failure
 * included) so the resolution cost is paid once per process. An install that
 * somehow lacks the parser degrades to "proves nothing", which keeps the rule
 * reporting rather than throwing.
 */
function getForeignParse(): ForeignParse | null {
  if (foreignParse === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const estree = require('@typescript-eslint/typescript-estree');
      foreignParse = (estree?.parse as ForeignParse | undefined) ?? null;
    } catch {
      foreignParse = null;
    }
  }
  return foreignParse;
}

/**
 * Parse a sibling module into an AST. Only a real parse can decide what a type
 * declares: text that merely looks like a declaration — inside a string, a
 * template literal, a comment or a nested scope — must never stand in for it. A
 * file that cannot be read or parsed proves nothing.
 */
function parseModuleProgram(filePath: string): TSESTree.Program | null {
  const parse = getForeignParse();
  if (!parse) {
    return null;
  }
  try {
    return parse(fs.readFileSync(filePath, 'utf8'), {
      jsx: true,
      loc: false,
      range: false,
      comment: false,
    });
  } catch {
    return null;
  }
}

type TypeImport = { source: string; exported: string };

/**
 * Locate the relative import that introduces `localName` as a type.
 *
 * Only a named specifier qualifies, in either the `import type { X }` or the
 * `import { X }` spelling. A namespace import is referenced as `Ns.X`, a
 * qualified name this enumerator does not read, and a default-exported type has
 * no name to look up in the sibling.
 */
function findRelativeTypeImport(
  program: TSESTree.Program,
  localName: string,
): TypeImport | null {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      typeof statement.source.value !== 'string' ||
      !RELATIVE_SOURCE.test(statement.source.value)
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.local.name === localName
      ) {
        return {
          source: statement.source.value,
          exported: specifier.imported.name,
        };
      }
    }
  }
  return null;
}

/**
 * Enumerates every property name a type node declares, or null when the member
 * list cannot be established with certainty.
 *
 * Only an unambiguous, fully written-out member list qualifies, reached either
 * directly or through the key-preserving operators in
 * {@link KEY_PRESERVING_TYPE_OPERATORS}. A union, an intersection, a mapped or
 * conditional type, any other generic instantiation and an interface with an
 * `extends` clause all describe a member set assembled elsewhere, so none of
 * them can prove anything here.
 *
 * A name the file does not declare is looked up in the relative module that
 * imports it, once; see {@link importedTypeMemberNames}.
 */
function memberNamesOf(
  typeNode: TSESTree.TypeNode,
  scope: TypeResolutionScope,
  seen: Set<TSESTree.Node> = new Set(),
): Set<string> | null {
  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
    return namesOfMembers(typeNode.members);
  }

  if (
    typeNode.type !== AST_NODE_TYPES.TSTypeReference ||
    typeNode.typeName.type !== AST_NODE_TYPES.Identifier
  ) {
    return null;
  }

  const name = typeNode.typeName.name;

  if (typeNode.typeParameters) {
    // An arity other than one is not the lib utility this name spells, so
    // nothing about the wrapped member list follows from it.
    if (
      !KEY_PRESERVING_TYPE_OPERATORS.has(name) ||
      typeNode.typeParameters.params.length !== 1 ||
      scope.isLocallyBound(name)
    ) {
      return null;
    }
    return memberNamesOf(typeNode.typeParameters.params[0], scope, seen);
  }

  const declaration = findLocalTypeDeclaration(scope.program, typeNode, name);
  if (!declaration) {
    // The file does not declare the name, so the only remaining source of a
    // written-down member list is the module it comes from.
    return scope.resolveImportedMembers?.(name) ?? null;
  }

  // A self-referential alias (`type T = T`) would otherwise recur forever. The
  // guard is keyed on the DECLARATION rather than the name: one name denotes
  // different declarations in different scopes, and a name-keyed guard would
  // abandon an outer type merely because an inner scope declares its name.
  if (seen.has(declaration)) {
    return null;
  }
  seen.add(declaration);

  return memberNamesOfDeclaration(declaration, scope, seen);
}

/**
 * The member names a type alias or interface declares. A generic declaration
 * describes a different member set per instantiation and an interface with an
 * `extends` clause inherits members written elsewhere, so neither enumerates.
 */
function memberNamesOfDeclaration(
  declaration: TypeDeclaration,
  scope: TypeResolutionScope,
  seen: Set<TSESTree.Node>,
): Set<string> | null {
  if (declaration.typeParameters) {
    return null;
  }

  if (declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
    return memberNamesOf(declaration.typeAnnotation, scope, seen);
  }

  if (declaration.extends && declaration.extends.length > 0) {
    return null;
  }
  return namesOfMembers(declaration.body.body);
}

/**
 * The member names of a type the file under lint imports from a relative
 * sibling, or null when the sibling proves nothing.
 *
 * Organising a module's types in a neighbouring `types.ts` is the ordinary
 * layout, so a proof that stops at the file boundary misses the common case
 * rather than the edge case (#1644). The hop is a single one: the sibling's own
 * scope carries no `resolveImportedMembers`, so a type it in turn imports, a
 * re-export and a barrel all stop the walk and leave the pick unproven, which
 * reports. Within the sibling, resolution is the same enumerator the file under
 * lint gets — alias chains, `Readonly`/`Required`/`Partial` unwrapping and the
 * shadowing guard all behave identically there.
 */
function importedTypeMemberNames(
  program: TSESTree.Program,
  fromDir: string,
  localName: string,
): Set<string> | null {
  const typeImport = findRelativeTypeImport(program, localName);
  if (!typeImport) {
    return null;
  }

  const resolved = resolveRelativeModule(fromDir, typeImport.source);
  if (!resolved) {
    return null;
  }

  const cacheKey = JSON.stringify([resolved.filePath, typeImport.exported]);
  const cached = importedMembersCache.get(cacheKey);
  if (
    cached &&
    cached.mtimeMs === resolved.mtimeMs &&
    cached.size === resolved.size
  ) {
    return cached.members;
  }

  const members = readExportedTypeMembers(
    resolved.filePath,
    typeImport.exported,
  );
  importedMembersCache.set(cacheKey, {
    mtimeMs: resolved.mtimeMs,
    size: resolved.size,
    members,
  });
  return members;
}

function readExportedTypeMembers(
  filePath: string,
  exported: string,
): Set<string> | null {
  const siblingProgram = parseModuleProgram(filePath);
  if (!siblingProgram) {
    return null;
  }

  const declaration = findDirectlyExportedTypeDeclaration(
    siblingProgram,
    exported,
  );
  if (!declaration) {
    return null;
  }

  let siblingBoundNames: Set<string> | null = null;
  const siblingScope: TypeResolutionScope = {
    program: siblingProgram,
    isLocallyBound: (name) => {
      if (!siblingBoundNames) {
        siblingBoundNames = new Set<string>();
        collectLocallyBoundNames(siblingProgram, siblingBoundNames);
      }
      return siblingBoundNames.has(name);
    },
  };

  return memberNamesOfDeclaration(
    declaration,
    siblingScope,
    new Set([declaration as TSESTree.Node]),
  );
}

type ForwardedField = {
  name: string;
  // The attribute/property node that forwards this field.
  node: TSESTree.JSXAttribute | TSESTree.Property;
};

/**
 * For a JSX element, returns the set of destructured names that are forwarded
 * with identical key names (e.g. `hits={hits}`, `isLoading={isLoading}`).
 * Returns null if:
 * - Any destructured name is forwarded to more than one place (multiple targets).
 * - Any destructured name is found in a conditional/computed spread expression.
 */
function collectJsxForwardedFields(
  openingElement: TSESTree.JSXOpeningElement,
  destructuredNames: Set<string>,
): ForwardedField[] | null {
  const forwarded: ForwardedField[] = [];

  for (const attr of openingElement.attributes) {
    // Spread attribute — check if any destructured name is used inside it.
    if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) {
      const usedInSpread = new Set<string>();
      collectIdentifierUses(attr.argument, usedInSpread);
      for (const name of destructuredNames) {
        if (usedInSpread.has(name)) {
          // The field is used in a conditional/computed spread — not safe.
          return null;
        }
      }
      continue;
    }

    if (attr.type !== AST_NODE_TYPES.JSXAttribute) continue;

    const attrName =
      attr.name.type === AST_NODE_TYPES.JSXIdentifier ? attr.name.name : null;
    if (!attrName) continue;

    if (!destructuredNames.has(attrName)) continue;

    // The attribute name matches a destructured name — check it is forwarded identically.
    if (attr.value === null) {
      // Boolean shorthand `isLoading` — not an identical forward (no value node).
      continue;
    }

    if (attr.value.type !== AST_NODE_TYPES.JSXExpressionContainer) continue;

    const expr = attr.value.expression;
    if (expr.type !== AST_NODE_TYPES.Identifier || expr.name !== attrName) {
      // Transformed or renamed forward — not eligible for spread.
      continue;
    }

    forwarded.push({ name: attrName, node: attr });
  }

  return forwarded;
}

/**
 * For an object expression, returns the set of destructured names that are
 * forwarded with identical (shorthand) key names.
 */
function collectObjectForwardedFields(
  objectExpression: TSESTree.ObjectExpression,
  destructuredNames: Set<string>,
): ForwardedField[] | null {
  const forwarded: ForwardedField[] = [];

  for (const prop of objectExpression.properties) {
    // Spread element in object — check if any destructured name is used.
    if (prop.type === AST_NODE_TYPES.SpreadElement) {
      const usedInSpread = new Set<string>();
      collectIdentifierUses(prop.argument, usedInSpread);
      for (const name of destructuredNames) {
        if (usedInSpread.has(name)) {
          return null;
        }
      }
      continue;
    }

    if (prop.type !== AST_NODE_TYPES.Property) continue;

    // Only shorthand properties qualify as identical forwards: { a, b, c }.
    if (!prop.shorthand) continue;
    if (prop.computed) continue;

    const key =
      prop.key.type === AST_NODE_TYPES.Identifier ? prop.key.name : null;
    if (!key || !destructuredNames.has(key)) continue;

    forwarded.push({ name: key, node: prop });
  }

  return forwarded;
}

/**
 * Walks the function body and finds the single JSX element or object literal
 * that acts as the target for forwarded props. Returns null if there is no
 * single unambiguous target, or if the body is too complex (multiple returns,
 * non-trivial logic, etc.).
 *
 * For the JSX variant we require:
 *   - The body is either a JSXElement directly (concise arrow) or a block
 *     statement with a single return statement returning a JSXElement.
 *
 * For the object-literal variant we require:
 *   - The body is a block statement with a single return statement returning
 *     an ObjectExpression (or the concise arrow body is an ObjectExpression).
 *
 * Either variant may arrive behind type-only wrappers, which are stripped
 * before the target is classified; see {@link unwrapTransparent}.
 */
type Target =
  | {
      kind: 'jsx';
      openingElement: TSESTree.JSXOpeningElement;
      jsxElement: TSESTree.JSXElement;
    }
  | { kind: 'object'; expression: TSESTree.ObjectExpression };

/**
 * Wrappers that exist only for the type checker: they compile away entirely, so
 * the value they wrap is the value the function actually produces.
 */
const TRANSPARENT_WRAPPERS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

/**
 * Strips every type-only wrapper (`as T`, `as const`, `satisfies T`, `!`) from
 * an expression. An assertion removes no reassembly — `{ a, b } as const` is
 * the very same destructure-then-reassemble as `{ a, b }` — so classifying the
 * target without stripping first turns an assertion into an accidental
 * suppression. The loop is what handles chains such as `{...} as unknown as T`,
 * and `enforce-object-literal-as-const` appends `as const` to exactly this
 * shape, so wrapped literals are the common case rather than the exotic one.
 */
function unwrapTransparent(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type)) {
    current = (
      current as
        | TSESTree.TSAsExpression
        | TSESTree.TSSatisfiesExpression
        | TSESTree.TSNonNullExpression
    ).expression;
  }
  return current;
}

/**
 * Classifies an already-unwrapped expression as a spread target. The fix is
 * anchored on the node returned here — the JSX opening element or the object
 * literal's own braces — so any wrapper stripped on the way in keeps its source
 * text untouched.
 */
function classifyTarget(expression: TSESTree.Node): Target | null {
  if (expression.type === AST_NODE_TYPES.JSXElement) {
    return {
      kind: 'jsx',
      openingElement: expression.openingElement,
      jsxElement: expression,
    };
  }

  // Concise arrow returning object literal: `({ x, y }) => ({ x, y, extra: 1 })`
  // The parser represents the parenthesized object as an ObjectExpression body.
  if (expression.type === AST_NODE_TYPES.ObjectExpression) {
    return { kind: 'object', expression };
  }

  return null;
}

function getSingleTarget(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): Target | null {
  const body = fn.body;

  // Concise arrow: `(props) => <X />`, `({ x, y }) => ({ x, y } as const)`.
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return classifyTarget(unwrapTransparent(body));
  }

  // Require exactly one statement in the block, which must be a return.
  if (body.body.length !== 1) {
    return null;
  }

  const stmt = body.body[0];
  if (stmt.type !== AST_NODE_TYPES.ReturnStatement || !stmt.argument) {
    return null;
  }

  return classifyTarget(unwrapTransparent(stmt.argument));
}

/**
 * Checks whether any of the destructured names is used anywhere in the
 * function body OUTSIDE of the forwarded attributes we already identified.
 * If a name is used elsewhere (conditional logic, side effects, other
 * expressions), we must not flag.
 */
function isNameUsedOutsideForwarding(
  fnBody: TSESTree.Node,
  name: string,
  forwardedNodes: Set<TSESTree.Node>,
): boolean {
  // Walk the entire function body AST, skip the forwarded nodes.
  const stack: TSESTree.Node[] = [fnBody];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    if (forwardedNodes.has(current)) {
      // Skip the subtree of a forwarded attribute/property — usage there is
      // accounted for by the forwarding.
      continue;
    }

    if (current.type === AST_NODE_TYPES.Identifier && current.name === name) {
      // Identifier found outside forwarded nodes — the field is used
      // elsewhere.
      //
      // However, JSX opening element attribute names are not references to the
      // destructured bindings, so we must exclude them. The parent check:
      // - If inside JSXAttribute.name => not a reference.
      const parent = current.parent as TSESTree.Node | undefined;
      const isJsxAttrName =
        parent !== undefined &&
        parent.type === AST_NODE_TYPES.JSXAttribute &&
        (parent as TSESTree.JSXAttribute).name === (current as unknown);
      if (isJsxAttrName) {
        // This is an attribute name, not a value reference — skip.
      } else {
        return true;
      }
    }

    for (const key of Object.keys(current)) {
      if (key === 'parent') continue;
      const value = (current as unknown as Record<string, unknown>)[key];
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
  return false;
}

/**
 * Finds a non-colliding name for the props parameter given the set of names
 * already in scope (inferred from the forwarded field names themselves and the
 * identifier `props`).
 */
function freshPropsName(existingNames: Set<string>): string {
  if (!existingNames.has('props')) return 'props';
  let i = 0;
  while (existingNames.has(`props${i}`)) i++;
  return `props${i}`;
}

/**
 * Rewrites the destructured parameter to a single identifier without touching
 * its type annotation. A parameter node's `range` spans the annotation, so
 * replacing the whole node would delete `: FooProps` and leave an implicit
 * `any`; the replacement is therefore bounded to the pattern's own closing
 * brace, leaving the annotation text (generics, unions, multi-line formatting)
 * exactly as the author wrote it. Returns null when the closing brace cannot be
 * located, so a malformed fix is never emitted.
 */
function replacePatternWithName(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  pattern: TSESTree.ObjectPattern,
  name: string,
): TSESLint.RuleFix | null {
  if (!pattern.typeAnnotation) {
    return fixer.replaceText(pattern, name);
  }

  // Scanning backwards from the annotation (whose range starts at the `:`)
  // skips any `?` optional marker sitting between the pattern and the colon.
  const closingBrace = sourceCode.getTokenBefore(pattern.typeAnnotation, {
    filter: (token) =>
      token.type === AST_TOKEN_TYPES.Punctuator && token.value === '}',
  });
  if (!closingBrace) {
    return null;
  }

  return fixer.replaceTextRange(
    [pattern.range[0], closingBrace.range[1]],
    name,
  );
}

/** An absolute `[start, end)` slice of the source text to splice out. */
type RemovalSpan = [number, number];

/**
 * The span to splice out for an item (JSX attribute or object property) that is
 * being replaced by the spread. It covers the item, the whitespace separating it
 * from whatever precedes it, and the comments that belong to it.
 *
 * Ownership of a comment is decided by line: a comment sharing a line with the
 * preceding item belongs to that item, while a comment on its own line belongs
 * to the item it sits above. Comments attached to a removed item go away with it
 * (the code they annotate is gone), but a comment belonging to a retained item —
 * an `eslint-disable-next-line` directive above it, for instance — is never
 * touched, which is the whole point of splicing instead of re-emitting.
 */
function removalSpanOf(
  sourceCode: Readonly<TSESLint.SourceCode>,
  item: TSESTree.Node,
  tail: TSESTree.Node | TSESTree.Token = item,
): RemovalSpan {
  const prevToken = sourceCode.getTokenBefore(item);
  let start = item.range[0];
  if (prevToken) {
    start = prevToken.range[1];
    for (const comment of sourceCode.getCommentsBefore(item)) {
      if (comment.loc.start.line !== prevToken.loc.end.line) break;
      start = comment.range[1];
    }
  }

  let end = tail.range[1];
  for (const comment of sourceCode.getCommentsAfter(tail)) {
    // Only a line comment is unambiguously owned by the item: it runs to the
    // end of the line, so nothing else can share it. A block comment followed
    // by more code on the same line may belong to what comes next, so it stays.
    if (
      comment.type !== AST_TOKEN_TYPES.Line ||
      comment.loc.start.line !== tail.loc.end.line
    ) {
      break;
    }
    end = comment.range[1];
  }

  return [start, end];
}

/**
 * Removes the given spans from `text`, whose first character sits at absolute
 * offset `textStart`. Overlapping spans are tolerated so callers can widen a
 * span (e.g. to swallow a separating comma) without coordinating with siblings.
 */
function spliceOut(
  text: string,
  textStart: number,
  spans: readonly RemovalSpan[],
): string {
  const textEnd = textStart + text.length;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = textStart;
  for (const [spanStart, spanEnd] of sorted) {
    const from = Math.max(spanStart, textStart);
    const to = Math.min(spanEnd, textEnd);
    if (to <= cursor) continue;
    if (from > cursor) {
      result += text.slice(cursor - textStart, from - textStart);
    }
    cursor = to;
  }
  if (cursor < textEnd) {
    result += text.slice(cursor - textStart);
  }
  return result;
}

/**
 * Drops a trailing comma the splice left behind, unless the author's own text
 * already ended with one (in which case the style is preserved).
 */
function dropDanglingComma(
  remaining: string,
  originalHadTrailingComma: boolean,
): string {
  if (originalHadTrailingComma || !remaining.trimEnd().endsWith(',')) {
    return remaining;
  }
  const commaIndex = remaining.lastIndexOf(',');
  return remaining.slice(0, commaIndex) + remaining.slice(commaIndex + 1);
}

/** The leading whitespace of a region, used to indent the inserted spread. */
function indentationOf(regionText: string): string {
  const leading = /^\s*/.exec(regionText);
  return leading && leading[0].length > 0 ? leading[0] : ' ';
}

/**
 * The offset where a JSX element's attribute region begins: just past the
 * element name and its type arguments, if any.
 */
function jsxAttributeRegionStart(
  openingElement: TSESTree.JSXOpeningElement,
): number {
  // The property is named `typeParameters` in older AST versions and
  // `typeArguments` in newer ones; both spell the same `<T>` after the name.
  const withTypeArgs = openingElement as TSESTree.JSXOpeningElement & {
    typeArguments?: { range: TSESTree.Range };
    typeParameters?: { range: TSESTree.Range };
  };
  const typeArgs = withTypeArgs.typeArguments ?? withTypeArgs.typeParameters;
  return (typeArgs ?? openingElement.name).range[1];
}

/**
 * The offset where a JSX element's attribute region ends: at the `/` of `/>` for
 * a self-closing element, otherwise at the `>`.
 */
function jsxAttributeRegionEnd(
  sourceCode: Readonly<TSESLint.SourceCode>,
  openingElement: TSESTree.JSXOpeningElement,
): number | null {
  const lastToken = sourceCode.getLastToken(openingElement);
  if (!lastToken) return null;
  if (!openingElement.selfClosing) return lastToken.range[0];
  const slash = sourceCode.getTokenBefore(lastToken);
  if (
    slash &&
    slash.type === AST_TOKEN_TYPES.Punctuator &&
    slash.value === '/'
  ) {
    return slash.range[0];
  }
  return lastToken.range[0];
}

/**
 * Replaces the forwarded attributes with a single `{...props}` by splicing out
 * only their own ranges, so every retained attribute keeps its source text, its
 * comments and the original line structure.
 */
function buildJsxSpreadFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  openingElement: TSESTree.JSXOpeningElement,
  removedAttributes: readonly TSESTree.Node[],
  propsName: string,
): TSESLint.RuleFix | null {
  const regionStart = jsxAttributeRegionStart(openingElement);
  const regionEnd = jsxAttributeRegionEnd(sourceCode, openingElement);
  if (regionEnd === null || regionEnd < regionStart) return null;

  const regionText = sourceCode.getText().slice(regionStart, regionEnd);
  const spans = removedAttributes.map((attr) =>
    removalSpanOf(sourceCode, attr),
  );
  const remaining = spliceOut(regionText, regionStart, spans);
  const spread = `{...${propsName}}`;

  // Nothing survives the collapse, so the element reduces to the spread alone.
  // A self-closing element keeps a space before its `/>`.
  const collapsedRegion = openingElement.selfClosing
    ? ` ${spread} `
    : ` ${spread}`;
  const newRegion =
    remaining.trim() === ''
      ? collapsedRegion
      : `${indentationOf(regionText)}${spread}${remaining}`;

  return fixer.replaceTextRange([regionStart, regionEnd], newRegion);
}

/**
 * Object-literal counterpart of {@link buildJsxSpreadFix}: splices out the
 * forwarded shorthand properties (with their separating comma) and inserts
 * `...props` in their place.
 */
function buildObjectSpreadFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  objectExpression: TSESTree.ObjectExpression,
  removedProperties: readonly TSESTree.Node[],
  propsName: string,
): TSESLint.RuleFix | null {
  const openBrace = sourceCode.getFirstToken(objectExpression);
  const closeBrace = sourceCode.getLastToken(objectExpression);
  if (!openBrace || !closeBrace) return null;

  const regionStart = openBrace.range[1];
  const regionEnd = closeBrace.range[0];
  if (regionEnd < regionStart) return null;

  const regionText = sourceCode.getText().slice(regionStart, regionEnd);
  const spans = removedProperties.map((prop) => {
    const nextToken = sourceCode.getTokenAfter(prop);
    const trailingComma =
      nextToken &&
      nextToken.type === AST_TOKEN_TYPES.Punctuator &&
      nextToken.value === ','
        ? nextToken
        : null;
    return removalSpanOf(sourceCode, prop, trailingComma ?? prop);
  });

  // Removing the final property leaves the comma that separated it from the
  // previous one, so a separator the author did not write is dropped again.
  const remaining = dropDanglingComma(
    spliceOut(regionText, regionStart, spans),
    regionText.trimEnd().endsWith(','),
  );
  const spread = `...${propsName}`;
  const newRegion =
    remaining.trim() === ''
      ? ` ${spread} `
      : `${indentationOf(regionText)}${spread},${remaining}`;

  return fixer.replaceTextRange([regionStart, regionEnd], newRegion);
}

export const preferSpreadOverReassembly = createRule<Options, MessageIds>({
  name: 'prefer-spread-over-reassembly',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer spread syntax over destructure-then-reassemble when all destructured fields are forwarded identically to a single target',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          minFields: {
            type: 'number',
            default: DEFAULT_MIN_FIELDS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferSpread:
        'Prefer spread over destructure-then-reassemble: replace the destructured parameter with a single identifier and use spread syntax on the target. ' +
        'This avoids silent bugs when new fields are added to the type.',
    },
  },
  defaultOptions: [{ minFields: DEFAULT_MIN_FIELDS }],
  create(context, [options]) {
    const minFields = options?.minFields ?? DEFAULT_MIN_FIELDS;
    const sourceCode = context.getSourceCode();
    const program = sourceCode.ast;

    // A relative specifier is anchored at the directory ESLint was configured
    // with, never the node process cwd. The two differ under the VS Code ESLint
    // extension, in monorepos and for any programmatic `new Linter({ cwd })`,
    // and anchoring at the process cwd there reads the wrong directory — which
    // in this rule's safe direction merely loses the proof, but loses it exactly
    // where the sibling `types.ts` layout is most common (issue #1476).
    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
    const rawFilename = context.getFilename();
    const containingDir = path.dirname(
      path.isAbsolute(rawFilename)
        ? rawFilename
        : path.resolve(cwd, rawFilename),
    );

    // The scan walks the whole file, so it is deferred until a key-preserving
    // operator actually turns up in a position the proof depends on — most
    // files never reach it.
    let locallyBoundNames: Set<string> | null = null;
    const typeScope: TypeResolutionScope = {
      program,
      isLocallyBound: (name) => {
        if (!locallyBoundNames) {
          locallyBoundNames = new Set<string>();
          collectLocallyBoundNames(program, locallyBoundNames);
        }
        return locallyBoundNames.has(name);
      },
      // Reached only from the about-to-report path, so a file with nothing to
      // report never stats or reads a sibling.
      resolveImportedMembers: (name) =>
        importedTypeMemberNames(program, containingDir, name),
    };

    /**
     * Walks an expression toward its syntactic root and returns the type node
     * that root declares, mirroring the receiver trace in
     * `enforce-firestore-doc-ref-generic`.
     *
     * The trace is syntax only. `parserOptions.project` is absent from the
     * shared testers and from many consumer configs, so a type-checker branch
     * would be dead exactly where the destructured pick it must protect lives —
     * inside an `Array.prototype.map` callback, whose signature comes from
     * `lib.d.ts`.
     */
    function typeNodeOfExpression(
      node: TSESTree.Node | null | undefined,
      visited: Set<TSESTree.Node>,
    ): TSESTree.TypeNode | null {
      // Guards against a self-referential declaration such as `const a = a.b;`.
      if (!node || visited.has(node)) {
        return null;
      }
      visited.add(node);

      switch (node.type) {
        case AST_NODE_TYPES.AwaitExpression: {
          const awaited = typeNodeOfExpression(node.argument, visited);
          return awaited ? unwrapPromise(awaited) : null;
        }
        case AST_NODE_TYPES.ChainExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
          return typeNodeOfExpression(node.expression, visited);
        // An assertion states the type outright, which is stronger evidence
        // than anything the operand could supply.
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
          return node.typeAnnotation;
        case AST_NODE_TYPES.Identifier:
          return typeNodeOfIdentifier(node, visited);
        case AST_NODE_TYPES.CallExpression:
          return typeNodeOfCallResult(node);
        default:
          // A member expression is deliberately absent: a property's type lives
          // in the type of its object, which syntax alone does not supply.
          return null;
      }
    }

    function typeNodeOfIdentifier(
      node: TSESTree.Identifier,
      visited: Set<TSESTree.Node>,
    ): TSESTree.TypeNode | null {
      const scope = ASTHelpers.getScope(context, node);
      const variable = ASTHelpers.findVariableInScope(scope, node.name);
      if (!variable || variable.defs.length !== 1) {
        return null;
      }

      const def = variable.defs[0];

      if (def.type === 'Parameter') {
        return def.name.type === AST_NODE_TYPES.Identifier &&
          def.name.typeAnnotation
          ? def.name.typeAnnotation.typeAnnotation
          : null;
      }

      if (
        def.type !== 'Variable' ||
        def.node.type !== AST_NODE_TYPES.VariableDeclarator
      ) {
        return null;
      }

      const declarator = def.node;

      // An annotation constrains every assignment rather than just the
      // initializer, so it describes the binding even when it is a `let`.
      if (
        declarator.id.type === AST_NODE_TYPES.Identifier &&
        declarator.id.typeAnnotation
      ) {
        return declarator.id.typeAnnotation.typeAnnotation;
      }

      // Without an annotation only an immutable binding still holds its
      // initializer's type by the time the callback runs.
      if (
        def.parent?.type !== AST_NODE_TYPES.VariableDeclaration ||
        def.parent.kind !== 'const'
      ) {
        return null;
      }

      return typeNodeOfExpression(declarator.init, visited);
    }

    /**
     * A receiver that is a call result takes its type from what the callee
     * declares it returns; an inferred return type is not written down and so
     * proves nothing.
     */
    function typeNodeOfCallResult(
      node: TSESTree.CallExpression,
    ): TSESTree.TypeNode | null {
      if (node.callee.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }

      const scope = ASTHelpers.getScope(context, node.callee);
      const variable = ASTHelpers.findVariableInScope(scope, node.callee.name);
      if (!variable || variable.defs.length !== 1) {
        return null;
      }

      const def = variable.defs[0];

      // A hoisted declaration binds the helper the same way a `const` arrow
      // does, so both spellings are read.
      if (def.type === 'FunctionName') {
        return def.node.returnType?.typeAnnotation ?? null;
      }

      if (
        def.type !== 'Variable' ||
        def.node.type !== AST_NODE_TYPES.VariableDeclarator ||
        def.parent?.type !== AST_NODE_TYPES.VariableDeclaration ||
        def.parent.kind !== 'const'
      ) {
        return null;
      }

      const init = def.node.init;
      if (
        init?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        init?.type !== AST_NODE_TYPES.FunctionExpression
      ) {
        return null;
      }
      return init.returnType?.typeAnnotation ?? null;
    }

    /**
     * The member names of the element type of the array whose method call this
     * function is the callback of, e.g. `Unit` for `units.map(fn)` where
     * `units` is annotated `Unit[]`.
     */
    function contextualElementMemberNames(
      fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): Set<string> | null {
      const call = fn.parent;
      if (
        !call ||
        call.type !== AST_NODE_TYPES.CallExpression ||
        call.arguments[0] !== fn ||
        call.callee.type !== AST_NODE_TYPES.MemberExpression ||
        call.callee.computed ||
        call.callee.property.type !== AST_NODE_TYPES.Identifier ||
        !ELEMENT_CALLBACK_METHODS.has(call.callee.property.name)
      ) {
        return null;
      }

      const receiverType = typeNodeOfExpression(call.callee.object, new Set());
      if (!receiverType) {
        return null;
      }

      const elementType = arrayElementTypeOf(receiverType);
      return elementType ? memberNamesOf(elementType, typeScope) : null;
    }

    /**
     * Reports whether the destructured pick is provably a PROPER subset of the
     * source object's own type, in which case spreading the parameter would add
     * the members the author left out and change what the function produces
     * (#1642: a GitHub review payload gained unknown keys).
     *
     * The proof runs in the safe direction only. A member set that matches the
     * pick exactly is exhaustive, so the rewrite is behavior-preserving and the
     * rule still reports; a type it cannot resolve — a union, an index
     * signature, an instantiation of anything but a key-preserving operator, or
     * an import whose module it declines to follow — yields no proof and the
     * rule likewise still reports. Silence is reserved for the case where the
     * widening is demonstrated.
     */
    function isProvablyNarrowingPick(
      fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      param: TSESTree.ObjectPattern,
      destructuredNames: readonly string[],
    ): boolean {
      // An explicit annotation overrides whatever the call site would imply,
      // so the contextual route is consulted only in its absence.
      const memberNames = param.typeAnnotation
        ? memberNamesOf(param.typeAnnotation.typeAnnotation, typeScope)
        : contextualElementMemberNames(fn);

      if (!memberNames || memberNames.size <= destructuredNames.length) {
        return false;
      }
      return destructuredNames.every((name) => memberNames.has(name));
    }

    function checkFunction(
      fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
    ): void {
      // Must have exactly one parameter that is an ObjectPattern.
      if (fn.params.length !== 1) return;
      const param = fn.params[0];
      if (param.type !== AST_NODE_TYPES.ObjectPattern) return;

      const destructuredNames = getSimpleDestructuredNames(param);
      if (!destructuredNames || destructuredNames.length < minFields) return;

      const namesSet = new Set(destructuredNames);

      // Find the single target element/object in the function body.
      const target = getSingleTarget(fn);
      if (!target) return;

      // Collect which destructured fields are forwarded identically.
      let forwarded: ForwardedField[] | null;
      if (target.kind === 'jsx') {
        forwarded = collectJsxForwardedFields(target.openingElement, namesSet);
      } else {
        forwarded = collectObjectForwardedFields(target.expression, namesSet);
      }

      if (!forwarded) return;

      // We need at least minFields to be forwarded identically.
      if (forwarded.length < minFields) return;

      // The attribute/property nodes that the spread replaces. They are also
      // excluded from the "used elsewhere" check below. Captured outside the
      // fixer so the narrowed (non-null) type survives into the closure.
      const forwardedNodes: TSESTree.Node[] = forwarded.map((f) => f.node);
      const forwardedNodeSet = new Set<TSESTree.Node>(forwardedNodes);

      // Ensure none of the forwarded names is used anywhere else in the body.
      for (const { name } of forwarded) {
        if (isNameUsedOutsideForwarding(fn.body, name, forwardedNodeSet)) {
          return;
        }
      }

      // All forwarded names must represent ALL destructured names (per issue
      // spec: "only flag when ALL destructured fields [...] are passed to a
      // single target"). If some destructured fields are not forwarded at all,
      // they must be used somewhere — the check above would have caught that.
      // But we also want to be conservative: only flag if ALL destructured
      // names are accounted for (either forwarded or... but the spec says they
      // should all go to the same target).
      const forwardedNamesSet = new Set(forwarded.map((f) => f.name));
      for (const name of destructuredNames) {
        if (!forwardedNamesSet.has(name)) {
          // This destructured name is not forwarded to the target — it might
          // be used elsewhere (which would have been caught above) or it is
          // truly unused. Either way, don't flag.
          return;
        }
      }

      // The pick may exist precisely because the omitted members must not flow
      // through; spreading would reinstate them.
      if (isProvablyNarrowingPick(fn, param, destructuredNames)) {
        return;
      }

      context.report({
        node: param,
        messageId: 'preferSpread',
        fix(fixer) {
          const fixes: TSESLint.RuleFix[] = [];

          // Choose a fresh name for the props parameter that does not collide
          // with any binding currently in scope.
          const propsName = freshPropsName(namesSet);

          // 1. Replace the destructured parameter with `props` (or fresh name),
          // keeping any type annotation intact.
          const paramFix = replacePatternWithName(
            fixer,
            sourceCode,
            param,
            propsName,
          );
          if (!paramFix) {
            return null;
          }
          fixes.push(paramFix);

          // 2. Collapse the forwarded fields into a single spread. Only the
          // ranges of the fields being collapsed are spliced out; the retained
          // ones — and the comments attached to them, which may be
          // `eslint-disable` directives — are left exactly as authored.
          const targetFix =
            target.kind === 'jsx'
              ? buildJsxSpreadFix(
                  fixer,
                  sourceCode,
                  target.openingElement,
                  forwardedNodes,
                  propsName,
                )
              : buildObjectSpreadFix(
                  fixer,
                  sourceCode,
                  target.expression,
                  forwardedNodes,
                  propsName,
                );
          if (!targetFix) {
            return null;
          }
          fixes.push(targetFix);

          return fixes;
        },
      });
    }

    return {
      ArrowFunctionExpression(node) {
        checkFunction(node);
      },
      FunctionExpression(node) {
        checkFunction(node);
      },
    };
  },
});
