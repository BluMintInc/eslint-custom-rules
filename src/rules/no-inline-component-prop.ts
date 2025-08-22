import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { minimatch as mm } from 'minimatch';

// Options for the rule
interface RuleOptions {
	props?: string[];
	allowRenderProps?: boolean;
	allowModuleScopeFactories?: boolean;
}

type MessageIds = 'noInlineComponentProp';

const DEFAULT_OPTIONS: Required<RuleOptions> = {
	props: ['CatalogWrapper', '*Wrapper', '*Component'],
	allowRenderProps: true,
	allowModuleScopeFactories: true,
};

const DEFAULT_RENDER_PROP_NAMES = new Set([
	'children',
	'render',
	'rowRenderer',
	'renderRow',
	'renderItem',
	'itemRenderer',
	'cellRenderer',
]);

function isModuleScope(node: TSESTree.Node): boolean {
	let current: TSESTree.Node | undefined = node;
	while (current) {
		if (
			current.type === AST_NODE_TYPES.FunctionDeclaration ||
			current.type === AST_NODE_TYPES.FunctionExpression ||
			current.type === AST_NODE_TYPES.ArrowFunctionExpression
		) {
			return false;
		}
		if (current.type === AST_NODE_TYPES.Program) return true;
		current = current.parent;
	}
	return true;
}

function isInlineFunctionExpression(
	node: TSESTree.Node | null | undefined,
): node is
	| TSESTree.ArrowFunctionExpression
	| TSESTree.FunctionExpression {
	if (!node) return false;
	return (
		node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
		node.type === AST_NODE_TYPES.FunctionExpression
	);
}

function isUseCallbackOrMemoCall(node: TSESTree.Node): node is TSESTree.CallExpression {
	if (node.type !== AST_NODE_TYPES.CallExpression) return false;
	const callee = node.callee;
	if (callee.type === AST_NODE_TYPES.Identifier) {
		return callee.name === 'useCallback' || callee.name === 'useMemo';
	}
	if (
		callee.type === AST_NODE_TYPES.MemberExpression &&
		callee.property.type === AST_NODE_TYPES.Identifier &&
		(callee.property.name === 'useCallback' || callee.property.name === 'useMemo')
	) {
		return true;
	}
	return false;
}

function matchesAnyPattern(name: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		if (mm(name, pattern, { nocase: false })) return true;
	}
	return false;
}

// Basic JSX detection
function containsJsxInFunction(
	node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
	const body = node.body;
	if (
		body.type === AST_NODE_TYPES.JSXElement ||
		body.type === AST_NODE_TYPES.JSXFragment
	) {
		return true;
	}
	if (body.type === AST_NODE_TYPES.BlockStatement) {
		for (const stmt of body.body) {
			if (
				stmt.type === AST_NODE_TYPES.ReturnStatement &&
				stmt.argument &&
				(stmt.argument.type === AST_NODE_TYPES.JSXElement ||
					stmt.argument.type === AST_NODE_TYPES.JSXFragment)
			) {
				return true;
			}
		}
	}
	return false;
}

function findVariableInScopeChain(context: any, name: string) {
	let scope: any = context.getScope();
	while (scope) {
		const variable = scope.variables?.find((v: any) => v.name === name);
		if (variable) return variable;
		scope = scope.upper;
	}
	return undefined;
}

export const noInlineComponentProp = createRule<[RuleOptions?], MessageIds>({
	name: 'no-inline-component-prop',
	meta: {
		type: 'problem',
		docs: {
			description:
				'Prohibit passing inline function components created in render to component-type props (e.g., CatalogWrapper). Use a stable, top-level memoized component instead.',
			recommended: 'error',
		},
		schema: [
			{
				type: 'object',
				properties: {
					props: {
						type: 'array',
						items: { type: 'string' },
						default: DEFAULT_OPTIONS.props,
					},
					allowRenderProps: { type: 'boolean', default: true },
					allowModuleScopeFactories: { type: 'boolean', default: true },
				},
				additionalProperties: false,
			},
		],
		messages: {
			noInlineComponentProp:
				'Do not pass an inline component created in render to component-type props (e.g., CatalogWrapper). Use a stable, top-level memoized component and lift dynamic data via props or context to avoid remounts and UI flashes.',
		},
	},
	defaultOptions: [DEFAULT_OPTIONS],
	create(context, [options]) {
		const opts: Required<RuleOptions> = {
			...DEFAULT_OPTIONS,
			...(options || {}),
		};

		function shouldCheckProp(propName: string): boolean {
			if (opts.allowRenderProps && DEFAULT_RENDER_PROP_NAMES.has(propName)) {
				return false;
			}
			return matchesAnyPattern(propName, opts.props);
		}

		function isDisallowedInlineFunction(node: TSESTree.Node): boolean {
			if (isInlineFunctionExpression(node)) {
				return true;
			}

			if (node.type === AST_NODE_TYPES.CallExpression) {
				const callExprAny: any = node;
				if (isUseCallbackOrMemoCall(node)) {
					return true; // Always disallow useCallback/useMemo-created wrappers in render
				}
				// Also disallow React.memo at render scope
				if (
					callExprAny.callee?.type === AST_NODE_TYPES.Identifier &&
					callExprAny.callee?.name === 'memo'
				) {
					return true;
				}
				if (
					callExprAny.callee?.type === AST_NODE_TYPES.MemberExpression &&
					callExprAny.callee?.property?.type === AST_NODE_TYPES.Identifier &&
					callExprAny.callee?.property?.name === 'memo'
				) {
					return true;
				}
			}
			return false;
		}

		function isTopLevelFactory(node: TSESTree.Node): boolean {
			if (!opts.allowModuleScopeFactories) return false;
			return isModuleScope(node);
		}

		return {
			JSXAttribute(attribute: TSESTree.JSXAttribute) {
				if (attribute.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
				const propName = attribute.name.name;
				if (!shouldCheckProp(propName)) return;

				const value = attribute.value;
				if (!value) return; // boolean true props like <X CatalogWrapper /> not our concern

				if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
					const expr = value.expression;

					// Case 1: Direct inline function expression passed
					if (isDisallowedInlineFunction(expr)) {
						// If created at module scope and allowed, skip
						if (isTopLevelFactory(expr)) return;
						context.report({ node: attribute, messageId: 'noInlineComponentProp' });
						return;
					}

					// Case 2: Identifier referencing a local inline function definition
					if (expr.type === AST_NODE_TYPES.Identifier) {
						const variable = findVariableInScopeChain(context, expr.name);
						if (!variable || !variable.defs || variable.defs.length === 0) {
							return;
						}

						// If imported or global, skip
						const hasImportDef = variable.defs.some(
							(def: any) => def.type === 'ImportBinding',
						);
						if (hasImportDef) return;

						for (const def of variable.defs) {
							// Variable declarator
							if (
								def.type === 'Variable' &&
								def.node &&
								(def.node as TSESTree.VariableDeclarator).init
							) {
								const init = (def.node as TSESTree.VariableDeclarator)
									.init!;

								// If at module scope and allowed, skip
								if (isTopLevelFactory(def.node)) continue;

								if (isDisallowedInlineFunction(init)) {
									context.report({
										node: attribute,
										messageId: 'noInlineComponentProp',
									});
									return;
								}

								// Special case: useMemo(() => () => <JSX />)
								if (
									isUseCallbackOrMemoCall(init) &&
									init.arguments.length > 0
								) {
									const first = init.arguments[0];
									if (
										first.type === AST_NODE_TYPES.ArrowFunctionExpression ||
										first.type === AST_NODE_TYPES.FunctionExpression
									) {
										if (containsJsxInFunction(first)) {
											context.report({
												node: attribute,
												messageId: 'noInlineComponentProp',
											});
											return;
										}
									}
								}
							}

							// Function declaration within render scope
							if (
								def.type === 'FunctionName' &&
								def.node &&
								!isModuleScope(def.node)
							) {
								context.report({ node: attribute, messageId: 'noInlineComponentProp' });
								return;
							}
						}
					}
				}
			},
		};
	},
});