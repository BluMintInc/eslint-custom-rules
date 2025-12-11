"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnusedProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.noUnusedProps = (0, createRule_1.createRule)({
    name: 'no-unused-props',
    meta: {
        type: 'problem',
        docs: {
            description: 'Detect unused props in React component type definitions',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unusedProp: 'Prop "{{propName}}" is defined in the Props type but not used in the component. Either use the prop in your component or remove it from the Props type. If you need to forward all props, use a rest spread operator: `const MyComponent = ({ usedProp, ...rest }: Props) => ...`',
        },
        fixable: 'code',
    },
    defaultOptions: [],
    create(context) {
        const propsTypes = new Map();
        const usedProps = new Map();
        // Track which spread types have been used in a component
        const usedSpreadTypes = new Map();
        let currentComponent = null;
        return {
            TSTypeAliasDeclaration(node) {
                if (node.id.name.endsWith('Props')) {
                    const props = {};
                    // Track which properties come from which spread type
                    const spreadTypeProps = {};
                    function extractProps(typeNode) {
                        if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
                            typeNode.members.forEach((member) => {
                                if (member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                                    member.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    props[member.key.name] = member.key;
                                }
                            });
                        }
                        else if (typeNode.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
                            typeNode.types.forEach((type) => {
                                if (type.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
                                    const typeName = type.typeName;
                                    if (typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        if (typeName.name === 'Pick' && type.typeParameters) {
                                            // Handle Pick utility type in intersection
                                            const [baseType, pickedProps] = type.typeParameters.params;
                                            if (baseType.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                                                baseType.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                                                const baseTypeName = baseType.typeName.name;
                                                // Extract the picked properties from the union type
                                                if (pickedProps.type === utils_1.AST_NODE_TYPES.TSUnionType) {
                                                    pickedProps.types.forEach((t) => {
                                                        if (t.type === utils_1.AST_NODE_TYPES.TSLiteralType &&
                                                            t.literal.type === utils_1.AST_NODE_TYPES.Literal &&
                                                            typeof t.literal.value === 'string') {
                                                            // Add each picked property as a regular prop
                                                            const propName = t.literal.value;
                                                            props[propName] = t.literal;
                                                            // Track that this prop comes from the base type
                                                            if (!spreadTypeProps[baseTypeName]) {
                                                                spreadTypeProps[baseTypeName] = [];
                                                            }
                                                            spreadTypeProps[baseTypeName].push(propName);
                                                        }
                                                    });
                                                }
                                                else if (pickedProps.type === utils_1.AST_NODE_TYPES.TSLiteralType &&
                                                    pickedProps.literal.type === utils_1.AST_NODE_TYPES.Literal &&
                                                    typeof pickedProps.literal.value === 'string') {
                                                    // Single property pick
                                                    const propName = pickedProps.literal.value;
                                                    props[propName] = pickedProps.literal;
                                                    // Track that this prop comes from the base type
                                                    if (!spreadTypeProps[baseTypeName]) {
                                                        spreadTypeProps[baseTypeName] = [];
                                                    }
                                                    spreadTypeProps[baseTypeName].push(propName);
                                                }
                                            }
                                        }
                                        else {
                                            // For referenced types in intersections, we need to find their type declaration
                                            const scope = context.getScope();
                                            const variable = scope.variables.find((v) => v.name === typeName.name);
                                            if (variable &&
                                                variable.defs[0]?.node.type ===
                                                    utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration) {
                                                extractProps(variable.defs[0].node.typeAnnotation);
                                            }
                                            else {
                                                // If we can't find the type declaration, it's likely an imported type
                                                // Mark it as a forwarded prop
                                                const spreadTypeName = typeName.name;
                                                props[`...${spreadTypeName}`] = typeName;
                                                // For imported types, we need to track individual properties that might be used
                                                // from this spread type, even if we don't know what they are yet
                                                if (!spreadTypeProps[spreadTypeName]) {
                                                    spreadTypeProps[spreadTypeName] = [];
                                                }
                                            }
                                        }
                                    }
                                }
                                else {
                                    extractProps(type);
                                }
                            });
                        }
                        else if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeReference) {
                            if (typeNode.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                                // List of TypeScript utility types that transform other types
                                const utilityTypes = ['Pick', 'Omit', 'Partial', 'Required', 'Record', 'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'InstanceType', 'ThisType'];
                                // Skip checking for utility type parameters (T, K, etc.) as they're not actual props
                                if (typeNode.typeName.name.length === 1 && /^[A-Z]$/.test(typeNode.typeName.name)) {
                                    // This is likely a generic type parameter (T, K, etc.), not a real type
                                    // Skip it to avoid false positives
                                    return;
                                }
                                if (typeNode.typeName.name === 'Pick' &&
                                    typeNode.typeParameters) {
                                    // Handle Pick utility type
                                    const [baseType, pickedProps] = typeNode.typeParameters.params;
                                    if (baseType.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                                        baseType.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        const baseTypeName = baseType.typeName.name;
                                        // Extract the picked properties from the union type
                                        if (pickedProps.type === utils_1.AST_NODE_TYPES.TSUnionType) {
                                            pickedProps.types.forEach((type) => {
                                                if (type.type === utils_1.AST_NODE_TYPES.TSLiteralType &&
                                                    type.literal.type === utils_1.AST_NODE_TYPES.Literal &&
                                                    typeof type.literal.value === 'string') {
                                                    // Add each picked property as a regular prop
                                                    const propName = type.literal.value;
                                                    props[propName] = type.literal;
                                                    // Track that this prop comes from the base type
                                                    if (!spreadTypeProps[baseTypeName]) {
                                                        spreadTypeProps[baseTypeName] = [];
                                                    }
                                                    spreadTypeProps[baseTypeName].push(propName);
                                                }
                                            });
                                        }
                                        else if (pickedProps.type === utils_1.AST_NODE_TYPES.TSLiteralType &&
                                            pickedProps.literal.type === utils_1.AST_NODE_TYPES.Literal &&
                                            typeof pickedProps.literal.value === 'string') {
                                            // Single property pick
                                            const propName = pickedProps.literal.value;
                                            props[propName] = pickedProps.literal;
                                            // Track that this prop comes from the base type
                                            if (!spreadTypeProps[baseTypeName]) {
                                                spreadTypeProps[baseTypeName] = [];
                                            }
                                            spreadTypeProps[baseTypeName].push(propName);
                                        }
                                    }
                                }
                                else if (
                                // Handle other utility types like Required, Partial, etc.
                                utilityTypes.includes(typeNode.typeName.name) &&
                                    typeNode.typeParameters) {
                                    // For utility types like Required<T, K>, we need to handle the base type
                                    const baseType = typeNode.typeParameters.params[0];
                                    if (baseType.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                                        baseType.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        // Mark the base type as used via the utility type
                                        const baseTypeName = baseType.typeName.name;
                                        props[`...${baseTypeName}`] = baseType.typeName;
                                        // For utility types, we need to track individual properties that might be used
                                        if (!spreadTypeProps[baseTypeName]) {
                                            spreadTypeProps[baseTypeName] = [];
                                        }
                                    }
                                }
                                else {
                                    // For referenced types like FormControlLabelProps, we need to track that these props should be forwarded
                                    const spreadTypeName = typeNode.typeName.name;
                                    props[`...${spreadTypeName}`] = typeNode.typeName;
                                    // For imported types, we need to track individual properties that might be used
                                    // from this spread type, even if we don't know what they are yet
                                    if (!spreadTypeProps[spreadTypeName]) {
                                        spreadTypeProps[spreadTypeName] = [];
                                    }
                                }
                            }
                        }
                    }
                    extractProps(node.typeAnnotation);
                    propsTypes.set(node.id.name, props);
                    // Store the mapping of spread types to their properties
                    const typeName = node.id.name;
                    usedSpreadTypes.set(typeName, new Set(Object.keys(spreadTypeProps)));
                    // Store the spread type properties for later reference
                    for (const [spreadType, propNames] of Object.entries(spreadTypeProps)) {
                        // Create a map entry for this spread type if it doesn't exist
                        if (!usedSpreadTypes.has(spreadType)) {
                            usedSpreadTypes.set(spreadType, new Set());
                        }
                        // Add the property names to the spread type's set
                        const spreadTypeSet = usedSpreadTypes.get(spreadType);
                        propNames.forEach((prop) => spreadTypeSet.add(prop));
                    }
                }
            },
            VariableDeclaration(node) {
                if (node.declarations.length === 1) {
                    const declaration = node.declarations[0];
                    if (declaration.init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                        const param = declaration.init.params[0];
                        if (param?.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                            param.typeAnnotation?.typeAnnotation.type ===
                                utils_1.AST_NODE_TYPES.TSTypeReference &&
                            param.typeAnnotation.typeAnnotation.typeName.type ===
                                utils_1.AST_NODE_TYPES.Identifier) {
                            const typeName = param.typeAnnotation.typeAnnotation.typeName.name;
                            if (typeName.endsWith('Props')) {
                                currentComponent = { node, typeName };
                                const used = new Set();
                                param.properties.forEach((prop) => {
                                    if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                                        prop.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        used.add(prop.key.name);
                                    }
                                    else if (prop.type === utils_1.AST_NODE_TYPES.RestElement &&
                                        prop.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        // Handle rest spread operator {...rest}
                                        // When a rest operator is used, all remaining props are considered used
                                        const propsType = propsTypes.get(typeName);
                                        if (propsType) {
                                            Object.keys(propsType).forEach((key) => {
                                                if (key.startsWith('...')) {
                                                    used.add(key);
                                                }
                                            });
                                        }
                                    }
                                });
                                usedProps.set(typeName, used);
                            }
                        }
                    }
                }
            },
            'VariableDeclaration:exit'(node) {
                if (currentComponent?.node === node) {
                    const { typeName } = currentComponent;
                    const propsType = propsTypes.get(typeName);
                    const used = usedProps.get(typeName);
                    if (propsType && used) {
                        Object.keys(propsType).forEach((prop) => {
                            if (!used.has(prop)) {
                                // For imported types (props that start with '...'), only report if there's no rest spread operator
                                // This allows imported types to be used without being flagged when properly forwarded
                                const hasRestSpread = Array.from(used.values()).some((usedProp) => usedProp.startsWith('...'));
                                // Don't report unused props if:
                                // 1. It's a spread type and there's a rest spread operator, OR
                                // 2. It's a property from a spread type and any property from that spread type is used, OR
                                // 3. It's a spread type and any of its properties are used in the component
                                let shouldReport = true;
                                // Skip reporting for generic type parameters (T, K, etc.)
                                if (prop.startsWith('...') && prop.length === 4 && /^\.\.\.([A-Z])$/.test(prop)) {
                                    // This is a generic type parameter like ...T, ...K, etc.
                                    shouldReport = false;
                                }
                                else if (prop.startsWith('...') && hasRestSpread) {
                                    shouldReport = false;
                                }
                                else if (prop.startsWith('...')) {
                                    // For spread types like "...GroupInfoBasic", check if any properties from this type are used
                                    const spreadTypeName = prop.substring(3); // Remove the "..." prefix
                                    // Get the properties that belong to this spread type
                                    const spreadTypeProps = usedSpreadTypes.get(spreadTypeName);
                                    if (spreadTypeProps) {
                                        // Check if any property from this spread type is being used in the component
                                        const anyPropFromSpreadTypeUsed = Array.from(spreadTypeProps).some((spreadProp) => used.has(spreadProp));
                                        if (anyPropFromSpreadTypeUsed) {
                                            shouldReport = false;
                                        }
                                    }
                                }
                                else {
                                    // Check if this prop might be from a spread type that has other properties being used
                                    for (const [spreadType, props] of usedSpreadTypes.entries()) {
                                        // Skip the current props type
                                        if (spreadType === typeName)
                                            continue;
                                        // If this prop is from a spread type
                                        if (props.has(prop)) {
                                            // Check if any other prop from this spread type is being used
                                            const anyPropFromSpreadTypeUsed = Array.from(props).some((spreadProp) => used.has(spreadProp));
                                            if (anyPropFromSpreadTypeUsed) {
                                                shouldReport = false;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (shouldReport) {
                                    context.report({
                                        node: propsType[prop],
                                        messageId: 'unusedProp',
                                        data: { propName: prop },
                                    });
                                }
                            }
                        });
                    }
                    // Reset state for this component
                    propsTypes.delete(typeName);
                    usedProps.delete(typeName);
                    currentComponent = null;
                }
            },
        };
    },
});
//# sourceMappingURL=no-unused-props.js.map