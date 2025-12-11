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
  //   
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
    ],
  },
);
