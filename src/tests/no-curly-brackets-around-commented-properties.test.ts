import { ruleTesterTs } from '../utils/ruleTester';
import { noCurlyBracketsAroundCommentedProperties } from '../rules/no-curly-brackets-around-commented-properties';

ruleTesterTs.run(
  'no-curly-brackets-around-commented-properties',
  noCurlyBracketsAroundCommentedProperties,
  {
    valid: [
      `
interface TournamentSettings {
  // maxTeamsPerMatch: number;
  isPublic: boolean;
}
      `,
      `
{
  const scopedValue = compute();
  // this block has executable code
}
      `,
      `
function process() {
  {
    // placeholder for debugging
  }
}
      `,
      `
if (shouldProcess) {
  // handled in caller
}
      `,
      `
namespace Api {
  // block comments without braces are fine
  // maxTeamsPerMatch: number;
}
      `,
      `
// Non-type comment-only block should not match
{
  // this is just a grouping note with no property signatures
}
const stillValid = true;
      `,
      `
try {
  risky();
} catch (error) {
  // swallowing error intentionally
}
      `,
      `
class Service {
  method() {
    {
      // class-local debug block
    }
  }
}
      `,
      `
// Inline comment without braces between declarations
type A = { value: string };
type B = { count: number };
      `,
      `
namespace Nested {
  export const useConfig = () => ({
    placeholder: true,
  });
}
      `,
      `
{

}
      `,
      `
{
  // remarks about module usage, not a type member
}
      `,
      `
{
  //   
}
      `,
      `
{
  // @ts-ignore
}
      `,
      `
{
  // @ts-expect-error
}
      `,
      /**
       * Structural bodies stay silent even when they hold nothing but a
       * member-shaped comment. A body is deliberate code, not an orphaned member
       * list, so widening the rule past module scope must not reach any of them.
       */
      `
if (shouldProcess) {
  // maxTeamsPerMatch: number;
}
      `,
      `
if (shouldProcess) {
  run();
} else {
  // maxTeamsPerMatch: number;
}
      `,
      `
try {
  // maxTeamsPerMatch: number;
} catch (error) {
  handle(error);
}
      `,
      `
try {
  risky();
} catch (error) {
  // maxTeamsPerMatch: number;
}
      `,
      `
try {
  risky();
} finally {
  // maxTeamsPerMatch: number;
}
      `,
      `
for (const item of items) {
  // maxTeamsPerMatch: number;
}
      `,
      `
for (let index = 0; index < total; index += 1) {
  // maxTeamsPerMatch: number;
}
      `,
      `
while (running) {
  // maxTeamsPerMatch: number;
}
      `,
      `
do {
  // maxTeamsPerMatch: number;
} while (running);
      `,
      `
function buildSettings() {
  // maxTeamsPerMatch: number;
}
      `,
      `
const buildSettings = () => {
  // maxTeamsPerMatch: number;
};
      `,
      `
class Service {
  method() {
    // maxTeamsPerMatch: number;
  }
}
      `,
      `
class Service {
  constructor() {
    // maxTeamsPerMatch: number;
  }
}
      `,
      `
class Service {
  get value() {
    // maxTeamsPerMatch: number;
  }
}
      `,
      `
class Service {
  static {
    // maxTeamsPerMatch: number;
  }
}
      `,
      // A labeled block is addressable by `break outer`, so it is deliberate.
      `
outer: {
  // maxTeamsPerMatch: number;
}
      `,
      `
switch (kind) {
  case 'legacy':
    // maxTeamsPerMatch: number;
    break;
}
      `,
      `
switch (kind) {
  case 'legacy': {
    // grouping note for the legacy branch
  }
}
      `,
      // A nested block holding executable code is a real scope, not a member list.
      `
function buildSettings() {
  {
    const scoped = compute();
    // maxTeamsPerMatch: number;
  }
}
      `,
      `
function buildSettings() {
  {
    // @ts-expect-error
  }
}
      `,
      `
function buildSettings() {
  {

  }
}
      `,
    ],
    invalid: [
      {
        code: `
{
  // maxTeamsPerMatch: number;
}
        `,
        output: `
// maxTeamsPerMatch: number;
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
{
  /**
   * @remarks this used to limit teams per match
   */
  // maxTeamsPerMatch: number;
}
type Remaining = { isPublic: boolean };
        `,
        output: `
/**
 * @remarks this used to limit teams per match
 */
// maxTeamsPerMatch: number;
type Remaining = { isPublic: boolean };
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
namespace TournamentSettings {
  export interface Settings {}
  {
    // deprecatedField: number;
  }
  export interface NextGen {}
}
        `,
        output: `
namespace TournamentSettings {
  export interface Settings {}
  // deprecatedField: number;
  export interface NextGen {}
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
{
  // oldField1: number;
  // oldField2: string;
  /**
   * @deprecated use newField instead
   */
  // oldField3: boolean;
}
        `,
        output: `
// oldField1: number;
// oldField2: string;
/**
 * @deprecated use newField instead
 */
// oldField3: boolean;
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
{
  // getOtherData(): string;
}
        `,
        output: `
// getOtherData(): string;
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
{
  /**
   * @todo Implement pagination
   * @future Add sorting options
   */
}
        `,
        output: `
/**
 * @todo Implement pagination
 * @future Add sorting options
 */
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
interface Wrapper {}
{
  // optionalField?: string;
}
        `,
        output: `
interface Wrapper {}
// optionalField?: string;
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
type Before = { id: string };
{
  // format(): string;
}
type After = { active: boolean };
        `,
        output: `
type Before = { id: string };
// format(): string;
type After = { active: boolean };
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
namespace Example {
  {
    /**
     * @remarks explanation spans
     * multiple lines with indentation
     */
    // deprecatedField: string;
  }

  export interface Item {
    value: string;
  }
}
        `,
        output: `
namespace Example {
  /**
   * @remarks explanation spans
   * multiple lines with indentation
   */
  // deprecatedField: string;

  export interface Item {
    value: string;
  }
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
namespace Legacy {
  {
    // value: number;
  }
}
        `,
        output: `
namespace Legacy {
  // value: number;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
{
  //   nested?: {
  //     prop: string;
  //   };
}
        `,
        output: `
//   nested?: {
//     prop: string;
//   };
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
{
  // account: {
  //   id: string;
  // };
}
{
  // user: string;
}
        `,
        output: `
// account: {
//   id: string;
// };
// user: string;
        `,
        errors: [
          { messageId: 'removeCommentWrappedBlock' },
          { messageId: 'removeCommentWrappedBlock' },
        ],
      },
      {
        code: `
namespace N {
  {
    // field: string;
  } export const x = 1;
}
        `,
        output: `
namespace N {
  // field: string;
  export const x = 1;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
namespace OverIndented {
  export interface S {}
    {
      // field: string;
    }
}
        `,
        output: `
namespace OverIndented {
  export interface S {}
  // field: string;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
declare module "foo" {
  {
    // field: string;
  }
}
        `,
        output: `
declare module "foo" {
  // field: string;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      /**
       * An orphaned block is the same authoring mistake wherever a statement is
       * legal, so nesting it one level in must not silence the rule.
       */
      {
        code: `
function buildSettings() {
  type Before = { id: string };
  {
    // format(): string;
  }
}
        `,
        output: `
function buildSettings() {
  type Before = { id: string };
  // format(): string;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
const buildSettings = () => {
  type Before = { id: string };
  {
    // maxTeamsPerMatch: number;
  }
  return null;
};
        `,
        output: `
const buildSettings = () => {
  type Before = { id: string };
  // maxTeamsPerMatch: number;
  return null;
};
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
class Service {
  method() {
    {
      // deprecatedField: string;
    }
  }
}
        `,
        output: `
class Service {
  method() {
    // deprecatedField: string;
  }
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
class Service {
  static {
    {
      // legacyFlag: boolean;
    }
  }
}
        `,
        output: `
class Service {
  static {
    // legacyFlag: boolean;
  }
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
switch (kind) {
  case 'legacy':
    {
      // deprecatedField: number;
    }
    break;
}
        `,
        output: `
switch (kind) {
  case 'legacy':
    // deprecatedField: number;
    break;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
switch (kind) {
  case 'legacy': {
    // deprecatedField: number;
  }
}
        `,
        output: `
switch (kind) {
  case 'legacy': // deprecatedField: number;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      // The enclosing `if` body is structural, but the block listed inside it is not.
      {
        code: `
if (shouldProcess) {
  // grouping note
  {
    // maxTeamsPerMatch: number;
  }
}
        `,
        output: `
if (shouldProcess) {
  // grouping note
  // maxTeamsPerMatch: number;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
try {
  {
    // maxTeamsPerMatch: number;
  }
  run();
} catch (error) {
  handle(error);
}
        `,
        output: `
try {
  // maxTeamsPerMatch: number;
  run();
} catch (error) {
  handle(error);
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      {
        code: `
for (const item of items) {
  {
    // maxTeamsPerMatch: number;
  }
}
        `,
        output: `
for (const item of items) {
  // maxTeamsPerMatch: number;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      // A namespace nested inside a function still names itself in the message.
      {
        code: `
function buildSettings() {
  namespace Legacy {
    {
      // value: number;
    }
  }
}
        `,
        output: `
function buildSettings() {
  namespace Legacy {
    // value: number;
  }
}
        `,
        errors: [
          {
            messageId: 'removeCommentWrappedBlock',
            data: { context: 'namespace "Legacy"' },
          },
        ],
      },
      {
        code: `
function buildSettings() {
  {
    // account: {
    //   id: string;
    // };
  }
  {
    // user: string;
  }
}
        `,
        output: `
function buildSettings() {
  // account: {
  //   id: string;
  // };
  // user: string;
}
        `,
        errors: [
          { messageId: 'removeCommentWrappedBlock' },
          { messageId: 'removeCommentWrappedBlock' },
        ],
      },
      {
        code: `
class Service {
  method() {
    {
      /**
       * @deprecated use newField instead
       */
      // oldField: boolean;
    }
    return null;
  }
}
        `,
        output: `
class Service {
  method() {
    /**
     * @deprecated use newField instead
     */
    // oldField: boolean;
    return null;
  }
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
      // Trailing code on the closing-brace line must not be commented out.
      {
        code: `
function buildSettings() {
  {
    // field: string;
  } const value = 1;
  return value;
}
        `,
        output: `
function buildSettings() {
  // field: string;
  const value = 1;
  return value;
}
        `,
        errors: [{ messageId: 'removeCommentWrappedBlock' }],
      },
    ],
  },
);
