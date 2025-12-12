/**
 * @fileoverview Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup
 * @author BluMint
 */
type MessageIds = 'missingGeneric' | 'invalidGeneric';
/**
 * @type {import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<MessageIds, [], import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>}
 */
export declare const enforceFirestoreDocRefGeneric: import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleModule<MessageIds, [], import("@typescript-eslint/utils/dist/ts-eslint/Rule").RuleListener>;
export {};
