"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassGraphBuilder = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ClassGraphSorterReadability_1 = require("./ClassGraphSorterReadability");
const ASTHelpers_1 = require("../ASTHelpers");
/**
 * Builds a graph of class methods and properties with their dependencies from a class declaration.
 * A dependency in this case is the name of another class method.
 */
class ClassGraphBuilder {
    constructor(className, classBody) {
        this.className = className;
        this.classBody = classBody;
        this.graph = {};
        this.buildGraph();
        // Note: extension requires injection of other sorters
        this.sorter = new ClassGraphSorterReadability_1.ClassGraphSorterReadability(this.graph);
    }
    buildGraph() {
        // NOTE: these need to be run sequentially for each member,
        // since we need to know the class members before we can search
        // methods for dependencies
        this.classBody.body.forEach((member) => {
            if (ClassGraphBuilder.isClassMember(member)) {
                this.addMemberToGraph(member);
            }
        });
        this.classBody.body.forEach((member) => {
            if (ClassGraphBuilder.isNamedClassMethod(member)) {
                const { key } = member;
                if (utils_1.ASTUtils.isIdentifier(key)) {
                    this.addDependencies(member, key.name);
                }
            }
        });
    }
    static isClassMember(node) {
        return (node.type === 'MethodDefinition' || node.type === 'PropertyDefinition');
    }
    addMemberToGraph(member) {
        const name = member.key.name;
        const type = ClassGraphBuilder.nodeTypeOf(member);
        const node = ClassGraphBuilder.createGraphNode(name, type, member.accessibility, member.static);
        this.graph[name] = node;
    }
    static nodeTypeOf(member) {
        if (member.type === 'MethodDefinition') {
            return member.kind === 'constructor' ? 'constructor' : 'method';
        }
        return 'property';
    }
    static createGraphNode(name, type, accessibility, isStatic = false) {
        return {
            name,
            type,
            accessibility,
            isStatic,
            dependencies: [],
        };
    }
    static isNamedClassMethod(node) {
        return node.type === 'MethodDefinition';
    }
    addDependencies(node, methodName) {
        const newDependencies = ASTHelpers_1.ASTHelpers.classMethodDependenciesOf(node, this.graph, this.className).filter((name) => {
            // Only include dependencies that exist exactly in the graph and aren't self-references
            return !!this.graph[name] && name !== methodName;
        });
        if (this.graph[methodName]) {
            // Ensure dependencies is initialized as an array
            if (!Array.isArray(this.graph[methodName].dependencies)) {
                this.graph[methodName].dependencies = [];
            }
            this.graph[methodName].dependencies.push(...newDependencies);
        }
    }
    get graphSorted() {
        return this.sorter.nodesSorted;
    }
    get memberNamesSorted() {
        return this.sorter.nodeNamesSorted;
    }
}
exports.ClassGraphBuilder = ClassGraphBuilder;
//# sourceMappingURL=ClassGraphBuilder.js.map