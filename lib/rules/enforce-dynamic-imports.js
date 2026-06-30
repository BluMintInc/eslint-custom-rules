"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_INTERNAL_PREFIXES = exports.DEFAULT_IGNORED_LIBRARIES = exports.RULE_NAME = void 0;
const createRule_1 = require("../utils/createRule");
const minimatch_1 = require("minimatch");
const module_1 = require("module");
exports.RULE_NAME = 'enforce-dynamic-imports';
exports.DEFAULT_IGNORED_LIBRARIES = [
    'react',
    'react/**',
    'react-dom',
    'react-dom/**',
    'next',
    'next/**',
    '@mui/material',
    '@mui/material/**',
    '@mui/icons-material',
    '@mui/icons-material/**',
    '@emotion/**',
    'clsx',
    'tailwind-merge',
];
exports.DEFAULT_INTERNAL_PREFIXES = ['src/', 'functions/'];
// Pre-built set of Node.js core module names for O(1) lookup.
const NODE_BUILTINS = new Set(module_1.builtinModules);
// Returns true for any source that resolves to a Node builtin: bare name
// ('crypto'), node:-prefixed ('node:fs'), or path form ('fs/promises').
const isNodeBuiltin = (source) => source.startsWith('node:') ||
    NODE_BUILTINS.has(source) ||
    NODE_BUILTINS.has(source.split('/')[0]);
exports.default = (0, createRule_1.createRule)({
    name: exports.RULE_NAME,
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce dynamic imports for external libraries by default to optimize bundle size, unless explicitly ignored',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    libraries: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    ignoredLibraries: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    internalPrefixes: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    allowImportType: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            dynamicImportRequired: 'Static import from "{{source}}" loads the full package into the initial bundle. → This increases download size and delays first render, undermining our lazy‑loading pattern for external dependencies. → Use a dynamic import (e.g., useDynamic(() => import("{{source}}"))), add "{{source}}" to ignoredLibraries for intentional static usage, or use a type‑only import when you only need types.',
        },
    },
    defaultOptions: [
        {
            ignoredLibraries: exports.DEFAULT_IGNORED_LIBRARIES,
            internalPrefixes: exports.DEFAULT_INTERNAL_PREFIXES,
            allowImportType: true,
        },
    ],
    create(context, [options]) {
        const { libraries, ignoredLibraries = exports.DEFAULT_IGNORED_LIBRARIES, internalPrefixes = exports.DEFAULT_INTERNAL_PREFIXES, allowImportType = true, } = options;
        // When `libraries` is provided, the rule operates in whitelist mode:
        // only the explicitly listed libraries are enforced. This preserves
        // backwards-compatibility with pre-1.16.0 consumer configurations.
        // When `libraries` is absent, enforce-by-default mode applies:
        // all external imports are flagged unless in `ignoredLibraries`.
        const isWhitelistMode = libraries !== undefined;
        // Build an O(1) + glob matcher from a list of library patterns.
        const buildMatcher = (list) => {
            const exactSet = new Set();
            const globs = [];
            for (const lib of list) {
                const mm = new minimatch_1.Minimatch(lib);
                if (mm.hasMagic()) {
                    globs.push(mm);
                }
                else {
                    exactSet.add(lib);
                }
            }
            return (source) => exactSet.has(source) || globs.some((mm) => mm.match(source));
        };
        const isListedInWhitelist = isWhitelistMode
            ? buildMatcher(libraries)
            : null;
        const isIgnored = !isWhitelistMode ? buildMatcher(ignoredLibraries) : null;
        // A source is external only if it looks like an npm package specifier AND
        // is not a known-internal path. Node builtins and configured internal
        // prefixes (e.g. src/, functions/) are excluded to avoid false positives
        // on TypeScript baseUrl imports and Node core modules.
        const isExternal = (source) => {
            return (/^[a-z0-9@]/i.test(source) &&
                !source.startsWith('@/') &&
                !isNodeBuiltin(source) &&
                !internalPrefixes.some((prefix) => source.startsWith(prefix)));
        };
        return {
            ImportDeclaration(node) {
                const importSource = node.source.value;
                // Skip type-only imports if allowed
                if (allowImportType) {
                    if (node.importKind === 'type') {
                        return;
                    }
                    if (node.specifiers.length > 0 &&
                        node.specifiers.every((spec) => spec.type === 'ImportSpecifier' && spec.importKind === 'type')) {
                        return;
                    }
                }
                let shouldReport;
                if (isWhitelistMode) {
                    // Whitelist mode: report only if the source matches an explicitly
                    // listed library. External detection and ignoredLibraries are not
                    // consulted, so unlisted npm packages are silently allowed.
                    shouldReport = isListedInWhitelist(importSource);
                }
                else {
                    // Enforce-by-default mode: report if the source is an external
                    // package and is not in the ignored list.
                    shouldReport = isExternal(importSource) && !isIgnored(importSource);
                }
                if (shouldReport) {
                    context.report({
                        node,
                        messageId: 'dynamicImportRequired',
                        data: {
                            source: importSource,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-dynamic-imports.js.map