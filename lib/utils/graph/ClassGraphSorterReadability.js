"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassGraphSorterReadability = void 0;
const ClassGraphSorter_1 = require("./ClassGraphSorter");
class ClassGraphSorterReadability extends ClassGraphSorter_1.ClassGraphSorter {
    constructor(graph) {
        super(graph);
        this.graph = graph;
    }
    get nodeNamesSorted() {
        return this.nodesSorted.map((node) => node.name);
    }
    get nodesSorted() {
        return this.sortNodes();
    }
    sortNodes() {
        const { methods, properties, classConstructor } = this.groupNodesByType();
        const [propertiesSorted, methodsSorted] = [properties, methods].map((nodeGroup) => nodeGroup.sort(ClassGraphSorterReadability.sortMembersForReadability));
        const searchNodeCandidates = [classConstructor, ...methodsSorted].filter((node) => !!node);
        const searchNodeCandidatesValidated = searchNodeCandidates.filter((method, _index, arr) => ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS.some((fn) => !!fn(method, arr)));
        const searchNodesSorted = searchNodeCandidatesValidated.sort((a, b) => {
            const getPriority = (method) => {
                const priority = ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS.findIndex((fn) => !!fn(method, methodsSorted));
                return priority === -1
                    ? ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS.length
                    : priority;
            };
            return getPriority(a) - getPriority(b);
        });
        const dfsSortedNodes = this.dependencyDfs(searchNodesSorted);
        return [...propertiesSorted, ...dfsSortedNodes];
    }
    groupNodesByType() {
        const nodes = Object.values(this.graph);
        return nodes.reduce((acc, node) => {
            switch (node.type) {
                case 'property':
                    acc.properties.push(node);
                    break;
                case 'constructor':
                    acc.classConstructor = node;
                    break;
                case 'method':
                    acc.methods.push(node);
                    break;
            }
            return acc;
        }, {
            properties: [],
            methods: [],
            classConstructor: null,
        });
    }
    static sortMembersForReadability(a, b) {
        // NOTE: the ordering from Object.entries is safe here since it is readonly
        for (const [key, priorities] of Object.entries(ClassGraphSorterReadability.MODIFIER_PRIORITY_MAP)) {
            const indexA = priorities.indexOf(a[key]);
            const indexB = priorities.indexOf(b[key]);
            if (indexA !== indexB) {
                return indexA - indexB;
            }
        }
        return 0;
    }
    dependencyDfs(searchNodes) {
        const visited = new Set();
        const dfsSortedNodes = [];
        const dfs = (node) => {
            if (!node || visited.has(node.name)) {
                return;
            }
            visited.add(node.name);
            dfsSortedNodes.push(node);
            // Ensure node.dependencies exists and is an array before iterating
            const dependencies = Array.isArray(node.dependencies)
                ? node.dependencies
                : [];
            for (const dep of dependencies) {
                const depNode = this.graph[String(dep)];
                if (depNode) {
                    dfs(depNode);
                }
            }
        };
        searchNodes.forEach((node) => dfs(node));
        return dfsSortedNodes;
    }
}
ClassGraphSorterReadability.MODIFIER_PRIORITY_MAP = {
    isStatic: [true, false],
    accessibility: ['public', undefined, 'private'],
};
ClassGraphSorterReadability.SEARCH_NODE_PRIORITY_FUNCTIONS = [
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (method, _methods) => method.type === 'constructor',
    (method, _methods) => !_methods.some((node) => node.dependencies.includes(method.name)),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (method, _methods) => method.dependencies.length === 0,
];
exports.ClassGraphSorterReadability = ClassGraphSorterReadability;
//# sourceMappingURL=ClassGraphSorterReadability.js.map