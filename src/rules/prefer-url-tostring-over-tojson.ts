import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import * as ts from 'typescript';

// Helpers to identify URL constructor expressions
function isUrlConstructor(newExpr: TSESTree.NewExpression): boolean {
	const callee = newExpr.callee;
	if (callee.type === AST_NODE_TYPES.Identifier) {
		return callee.name === 'URL';
	}
	if (callee.type === AST_NODE_TYPES.MemberExpression) {
		// e.g., new globalThis.URL(...), new window.URL(...)
		return (
			callee.property.type === AST_NODE_TYPES.Identifier &&
			callee.property.name === 'URL'
		);
	}
	return false;
}

function isJSONStringifyCall(node: TSESTree.CallExpression): boolean {
	const callee = node.callee;
	if (callee.type === AST_NODE_TYPES.MemberExpression) {
		return (
			callee.object.type === AST_NODE_TYPES.Identifier &&
			callee.object.name === 'JSON' &&
			callee.property.type === AST_NODE_TYPES.Identifier &&
			callee.property.name === 'stringify'
		);
	}
	return false;
}

function findEnclosingJSONStringify(node: TSESTree.Node | undefined): TSESTree.CallExpression | null {
	let current: TSESTree.Node | undefined = node;
	while (current && current.parent) {
		const parent = current.parent as TSESTree.Node;
		if (parent.type === AST_NODE_TYPES.CallExpression) {
			if (
				isJSONStringifyCall(parent) &&
				(parent as TSESTree.CallExpression).arguments.includes(
					current as TSESTree.Expression,
				)
			) {
				return parent as TSESTree.CallExpression;
			}
		}
		current = parent;
	}
	return null;
}

function isOptionalMemberExpression(
	expr: TSESTree.MemberExpression,
): boolean {
	// @typescript-eslint defines optional?: boolean on MemberExpression for optional chaining
	// Cast to any to safely access it across minor version diffs
	return (expr as any).optional === true;
}

export const preferUrlToStringOverToJson: TSESLint.RuleModule<
	'preferToString',
	never[]
> = createRule({
	create(context) {
		const sourceCode = context.getSourceCode();
		const parserServices = sourceCode.parserServices;

		const urlIdentifierNames = new Set<string>();
		let checker: ts.TypeChecker | null = null;

		if (
			parserServices &&
			parserServices.program &&
			typeof parserServices.program.getTypeChecker === 'function'
		) {
			try {
				checker = parserServices.program.getTypeChecker();
			} catch {
				checker = null;
			}
		}

		function isUrlType(expr: TSESTree.Expression): boolean {
			// Heuristic without types
			if (
				expr.type === AST_NODE_TYPES.NewExpression &&
				isUrlConstructor(expr)
			) {
				return true;
			}

			if (expr.type === AST_NODE_TYPES.Identifier) {
				if (urlIdentifierNames.has(expr.name)) return true;
			}

			// Typed check via TS when available
			if (
				checker &&
				parserServices &&
				(parserServices as any).esTreeNodeToTSNodeMap
			) {
				try {
					const tsNode = parserServices.esTreeNodeToTSNodeMap.get(expr);
					const type = checker.getTypeAtLocation(tsNode);
					const typeName = checker.typeToString(type);
					// Common representations include "URL", "globalThis.URL", "typeof URL" in some contexts
					if (
						typeName === 'URL' ||
						typeName.endsWith('.URL') ||
						typeName.includes('URL')
					) {
						return true;
					}
				} catch {
					// ignore type errors and fall through
				}
			}

			return false;
		}

		return {
			VariableDeclarator(node) {
				if (
					node.id.type === AST_NODE_TYPES.Identifier &&
					node.init &&
					node.init.type === AST_NODE_TYPES.NewExpression &&
					isUrlConstructor(node.init)
				) {
					urlIdentifierNames.add(node.id.name);
				}
			},
			AssignmentExpression(node) {
				if (
					node.left.type === AST_NODE_TYPES.Identifier &&
					node.right.type === AST_NODE_TYPES.NewExpression &&
					isUrlConstructor(node.right)
				) {
					urlIdentifierNames.add(node.left.name);
				}
			},

			CallExpression(node) {
				const callee = node.callee;
				if (callee.type !== AST_NODE_TYPES.MemberExpression) return;

				// property should be .toJSON
				if (
					callee.property.type !== AST_NODE_TYPES.Identifier ||
					callee.property.name !== 'toJSON'
				) {
					return;
				}

				const objectExpr = callee.object as TSESTree.Expression;

				if (!isUrlType(objectExpr)) return;

				const insideJSONStringify = findEnclosingJSONStringify(node);
				const memberExpr = callee;

				context.report({
					node,
					messageId: 'preferToString',
					fix(fixer) {
						// If inside JSON.stringify and not optional chain, replace the entire call with just the object
						if (insideJSONStringify && !isOptionalMemberExpression(memberExpr)) {
							const objText = sourceCode.getText(objectExpr);
							return fixer.replaceText(node, objText);
						}

						// Default: change .toJSON() -> .toString()
						const propertyRange = memberExpr.property.range as [number, number];
						return fixer.replaceTextRange(propertyRange, 'toString');
					},
				});
			},
		};
	},

	name: 'prefer-url-tostring-over-tojson',
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Enforce the use of toString() over toJSON() on URL objects. Prefer passing URL objects directly to JSON.stringify, which will call toJSON automatically.',
			recommended: 'error',
		},
		fixable: 'code',
		schema: [],
		messages: {
			preferToString:
				"Use toString() instead of toJSON() on URL objects. When serializing with JSON.stringify, pass the URL object directly.",
		},
	},
	defaultOptions: [],
});