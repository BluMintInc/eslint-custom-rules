/**
 * Fixture for issue #1316: a pure re-export. The definition lives in another
 * module, so this file proves nothing about the binding's parameter list and the
 * child must stay a composition dependency.
 */
export { BestOfText as ReExportedChild } from './BestOfText';
