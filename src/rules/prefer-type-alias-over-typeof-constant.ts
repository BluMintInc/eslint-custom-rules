import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

/** Utility to convert CONSTANT_CASE or snake/kebab to PascalCase */
function toPascalCase(name: string): string {
	return name
		.split(/[_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join('');
}

/** Determine if a value initializer represents a function or class (which we should ignore). */
function isFunctionOrClassInitializer(init: TSESTree.Expression | null | undefined): boolean {
	if (!init) return false;
	return (
		init.type === AST_NODE_TYPES.FunctionExpression ||
		init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
		init.type === AST_NODE_TYPES.ClassExpression
	);
}

/** Determine if node is a simple constant literal or object/array literal possibly with `as const` */
function isConstantLikeInitializer(init: TSESTree.Expression | null | undefined): boolean {
	if (!init) return false;
	if (isFunctionOrClassInitializer(init)) return false;
	switch (init.type) {
		case AST_NODE_TYPES.Literal:
			return true;
		case AST_NODE_TYPES.TemplateLiteral:
			return init.expressions.length === 0;
		case AST_NODE_TYPES.ObjectExpression:
			return true;
		case AST_NODE_TYPES.ArrayExpression:
			return true;
		case AST_NODE_TYPES.TSAsExpression:
			return isConstantLikeInitializer(init.expression as TSESTree.Expression);
		case AST_NODE_TYPES.UnaryExpression: {
			// treat unary constants (e.g., -1) as constant-like; exclude typeof
			if (init.operator === 'typeof') return false;
			return isConstantLikeInitializer(init.argument as TSESTree.Expression);
		}
		default:
			return false;
	}
}

/** Traverse a TSType and collect referenced identifier names (e.g., A, B in A | B). */
function collectReferencedTypeNames(node: TSESTree.Node, acc = new Set<string>()): Set<string> {
	switch (node.type) {
		case AST_NODE_TYPES.TSTypeReference: {
			if (node.typeName.type === AST_NODE_TYPES.Identifier) {
				acc.add(node.typeName.name);
			}
			if (node.typeParameters) {
				for (const p of node.typeParameters.params) collectReferencedTypeNames(p, acc);
			}
			break;
		}
		case AST_NODE_TYPES.TSUnionType:
		case AST_NODE_TYPES.TSIntersectionType: {
			for (const t of node.types) collectReferencedTypeNames(t, acc);
			break;
		}
		case AST_NODE_TYPES.TSArrayType: {
			collectReferencedTypeNames((node as any).elementType, acc);
			break;
		}
		case AST_NODE_TYPES.TSTypeOperator: {
			collectReferencedTypeNames((node as any).typeAnnotation, acc);
			break;
		}
		case AST_NODE_TYPES.TSTupleType: {
			for (const e of (node as any).elementTypes) collectReferencedTypeNames(e, acc);
			break;
		}
		default:
			break;
	}
	return acc;
}

/** Collects module-level consts and type aliases for quick lookup */
function collectTopLevelContext(program: TSESTree.Program) {
	const topLevelConstInitByName = new Map<string, TSESTree.Expression | null>();
	const topLevelConstNodeByName = new Map<string, TSESTree.VariableDeclarator>();
	const typeAliasByName = new Map<string, TSESTree.TSTypeAliasDeclaration>();
	const importedValueNames = new Set<string>();
	const importedTypeNames = new Set<string>();

	for (const stmt of program.body) {
		if (stmt.type === AST_NODE_TYPES.ImportDeclaration) {
			const isTypeImport = stmt.importKind === 'type';
			for (const spec of stmt.specifiers) {
				// import type { Foo } from '...'
				// import { Foo } from '...' as value import
				if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
					if (isTypeImport || spec.importKind === 'type') {
						importedTypeNames.add(spec.local.name);
					} else {
						importedValueNames.add(spec.local.name);
					}
				} else if (spec.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
					if (isTypeImport) {
						importedTypeNames.add(spec.local.name);
					} else {
						importedValueNames.add(spec.local.name);
					}
				} else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
					// Namespace imports expose names via MemberExpression; not tracked individually
				}
			}
		} else if (
			stmt.type === AST_NODE_TYPES.VariableDeclaration &&
			stmt.kind === 'const'
		) {
			for (const decl of stmt.declarations) {
				if (decl.id.type === AST_NODE_TYPES.Identifier) {
					topLevelConstInitByName.set(decl.id.name, (decl.init as TSESTree.Expression) ?? null);
					topLevelConstNodeByName.set(decl.id.name, decl);
				}
			}
		} else if (stmt.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
			typeAliasByName.set(stmt.id.name, stmt);
		} else if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration && stmt.declaration) {
			// Handle exported declarations: export const FOO = ...; export type Foo = ...
			const decl = stmt.declaration;
			if (decl.type === AST_NODE_TYPES.VariableDeclaration && decl.kind === 'const') {
				for (const d of decl.declarations) {
					if (d.id.type === AST_NODE_TYPES.Identifier) {
						topLevelConstInitByName.set(d.id.name, (d.init as TSESTree.Expression) ?? null);
						topLevelConstNodeByName.set(d.id.name, d);
					}
				}
			} else if (decl.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
				typeAliasByName.set(decl.id.name, decl);
			}
		}
	}

	return {
		topLevelConstInitByName,
		topLevelConstNodeByName,
		typeAliasByName,
		importedValueNames,
		importedTypeNames,
	};
}

export type MessageIds =
	| 'preferTypeAlias'
	| 'defineTypeBeforeConstant';

export const preferTypeAliasOverTypeofConstant: TSESLint.RuleModule<
	MessageIds,
	never[]
> = createRule({
	name: 'prefer-type-alias-over-typeof-constant',
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Prefer named type aliases over `typeof` on same-file global constants; ensure types are declared before constants.',
			recommended: 'error',
		},
		schema: [],
		messages: {
			preferTypeAlias:
				'Use a named type alias instead of `typeof {{constName}}` for global constants. Suggested alias: {{suggested}}.',
			defineTypeBeforeConstant:
				'Declare the type alias {{typeName}} before the constant {{constName}}.',
		},
	},
	defaultOptions: [],
	create(context) {
		let collected: ReturnType<typeof collectTopLevelContext> | undefined;

		return {
			Program(program) {
				collected = collectTopLevelContext(program);
			},

			// Enforce that type aliases referenced by const annotations appear before the const
			VariableDeclarator(node: TSESTree.VariableDeclarator) {
				if (!collected) return;
				if (node.id.type !== AST_NODE_TYPES.Identifier) return;
				const constName = node.id.name;

				// Only for top-level consts
				const decl = collected.topLevelConstNodeByName.get(constName);
				if (!decl || decl !== node) return;
				const parentDecl = node.parent as TSESTree.VariableDeclaration;
				if (!parentDecl || parentDecl.kind !== 'const') return;
				const typeAnn = node.id.typeAnnotation?.typeAnnotation;
				if (!typeAnn) return;

				for (const typeName of collectReferencedTypeNames(typeAnn)) {
					// If imported type, allow any order
					if (collected.importedTypeNames.has(typeName)) continue;
					const typeDecl = collected.typeAliasByName.get(typeName);
					if (typeDecl && typeDecl.range[0] > parentDecl.range[0]) {
						context.report({
							node: node.id,
							messageId: 'defineTypeBeforeConstant',
							data: { typeName, constName },
						});
					}
				}
			},

			// Core rule: flag `typeof CONST` when CONST is a same-file top-level const and constant-like
			TSTypeQuery(node: TSESTree.TSTypeQuery) {
				if (!collected) return;

				// Skip `keyof typeof X`
				if (
					node.parent &&
					node.parent.type === AST_NODE_TYPES.TSTypeOperator &&
					node.parent.operator === 'keyof'
				) {
					return;
				}

				if (node.exprName.type !== AST_NODE_TYPES.Identifier) {
					return;
				}
				const name = node.exprName.name;

				// Imported values: do not enforce (may suggest in future)
				if (collected.importedValueNames.has(name)) {
					return;
				}

				const init = collected.topLevelConstInitByName.get(name);
				if (init === undefined) {
					// Not a top-level const in this file
					return;
				}

				if (!isConstantLikeInitializer(init)) {
					return;
				}

				context.report({
					node,
					messageId: 'preferTypeAlias',
					data: { constName: name, suggested: toPascalCase(name) },
				});
			},
		};
	},
});