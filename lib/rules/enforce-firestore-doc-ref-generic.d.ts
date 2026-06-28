/**
 * @fileoverview Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup
 * @author BluMint
 */
type MessageIds = 'missingGeneric' | 'invalidGeneric';
/**
 * @type {import('eslint').Rule.RuleModule}
 */
export declare const enforceFirestoreDocRefGeneric: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, [], import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
