type Options = [
    {
        /**
         * When true, the rule also flags inline JSDoc on object literal properties.
         * By default, only interface/type literals and class fields are checked.
         */
        checkObjectLiterals?: boolean;
    }
];
export declare const jsdocAboveField: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<"moveJsdocAbove", Options, import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
