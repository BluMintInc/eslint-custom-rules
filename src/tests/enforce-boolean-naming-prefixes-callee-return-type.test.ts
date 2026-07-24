import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// Regression tests for the callee-return-type false positive.
// A callee whose own name carries a boolean prefix (can/is/has/should/…) does
// not imply that its return value is boolean: predicates that return a verdict
// object (`{ isValid, reason }`) are idiomatic. When the callee's declaration is
// resolvable in scope and its return is demonstrably non-boolean, the name
// heuristic must yield. When the declaration is not resolvable (cross-module
// import — the common case), the name heuristic stays in force.

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-callee-return-type',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // `can*` callee returning a discriminated-union verdict OBJECT
      `
      const canDropOnMatchCell = (id: string) => {
        return { isValid: id.length > 0, reason: 'nope' } as const;
      };
      const dropDecision = canDropOnMatchCell('a');
      `,
      // `is*` callee returning an OBJECT
      `
      const isDropValid = (id: string) => {
        return { isValid: id.length > 0 } as const;
      };
      const validation = isDropValid('a');
      `,
      // `should*` callee returning an OBJECT
      `
      const shouldDrop = (id: string) => {
        return { isValid: id.length > 0 } as const;
      };
      const dropOutcome = shouldDrop('a');
      `,
      // `can*` callee returning a STRING
      `
      const canDescribe = (id: string) => {
        return \`\${id}!\`;
      };
      const description = canDescribe('a');
      `,
      // explicit non-boolean return annotation must also be honored
      `
      type Verdict = { isValid: boolean; reason?: string };
      function canProceed(id: string): Verdict {
        return { isValid: id.length > 0 };
      }
      const verdict = canProceed('a');
      `,
      // Function DECLARATION callee returning an object literal
      `
      function canDropOnMatchCell(id: string) {
        return { isValid: id.length > 0, reason: 'nope' };
      }
      const dropDecision = canDropOnMatchCell('a');
      `,
      // Function EXPRESSION callee returning a template literal
      `
      const canFormat = function (id: string) {
        return \`\${id}!\`;
      };
      const formatted = canFormat('a');
      `,
      // Arrow with a concise (expression) body returning an object literal
      `
      const canSummarize = (id: string) => ({ summary: id });
      const summary = canSummarize('a');
      `,
      // Callee returning a numeric literal
      `
      const canCount = () => {
        return 42;
      };
      const total = canCount();
      `,
      // Callee returning an array literal
      `
      function hasItems() {
        return [1, 2, 3];
      }
      const items = hasItems();
      `,
      // Callee with an explicit non-boolean primitive annotation
      `
      function shouldLabel(id: string): string {
        return id;
      }
      const label = shouldLabel('a');
      `,
      // Union of boolean and object: the call cannot be relied on to yield a
      // boolean, so the rule stays silent (prefer false negatives).
      `
      type Verdict = { reason: string };
      function canProceed(id: string): boolean | Verdict {
        return { reason: id };
      }
      const proceedOutcome = canProceed('a');
      `,
      // Mixed returns (boolean in one branch, object in another) are likewise
      // not reliably boolean.
      `
      function canEvaluate(id: string) {
        if (id) {
          return true;
        }
        return { isValid: false };
      }
      const evaluation = canEvaluate('a');
      `,
      // Callee with no return statement yields undefined, never a boolean
      `
      function canNotify(id: string) {
        console.log(id);
      }
      const notification = canNotify('a');
      `,
      // Unawaited async callee yields a Promise, not a boolean
      `
      async function canLoad(): Promise<boolean> {
        return true;
      }
      const loadOutcome = canLoad();
      `,
      // Shadowing: the innermost declaration decides, and it returns an object
      `
      const canDrop = (): boolean => true;
      function outer(id: string) {
        const canDrop = (dropId: string) => ({ isValid: dropId.length > 0 });
        const dropDecision = canDrop(id);
        return dropDecision;
      }
      `,
      // Logical OR fallback whose left side is a resolvable non-boolean call
      `
      const canDropOnMatchCell = (id: string) => {
        return { isValid: id.length > 0 };
      };
      const dropDecision = canDropOnMatchCell('a') || defaultDecision;
      `,
      // Logical AND whose right side is a resolvable non-boolean call
      `
      const canDropOnMatchCell = (id: string) => ({ isValid: id.length > 0 });
      const dropDecision = someFlag && canDropOnMatchCell('a');
      `,
      // Getter path: the same gate applies when the call is evaluated through
      // callExpressionLooksBoolean rather than the declarator initializer.
      `
      function canDropHere(id: string) {
        return { isValid: id.length > 0 };
      }
      class Board {
        get dropDecision() {
          return canDropHere(this.id);
        }
      }
      `,
      // Getter path with an explicit non-boolean return annotation
      `
      type Verdict = { isValid: boolean };
      const checkDrop = (id: string): Verdict => ({ isValid: id.length > 0 });
      class Board {
        get dropDecision() {
          return checkDrop(this.id);
        }
      }
      `,
      // Callee resolvable through a parameter (its return is unknowable), but
      // the caller name already carries an approved prefix.
      `
      function run(canDrop: (id: string) => unknown) {
        const isDroppable = canDrop('a');
        return isDroppable;
      }
      `,
      // Recursive non-boolean callee must not send the resolver into a loop
      `
      const canWalk = (n: number) => {
        return n <= 0 ? { done: true } : canWalk(n - 1);
      };
      const walkResult = canWalk(3);
      `,
      // Exported predicate returning a verdict object, consumed field by field
      `
      export const canDropOnMatchCell = (source: string, target: string) => {
        return { isValid: source !== target, reason: 'occupied' };
      };
      const dropDecision = canDropOnMatchCell('a', 'b');
      if (!dropDecision.isValid) {
        console.log(dropDecision.reason);
      }
      `,
      // Hoisted function declaration used before its declaration
      `
      const dropDecision = canDropOnMatchCell('a');
      function canDropOnMatchCell(id: string) {
        return { isValid: id.length > 0 };
      }
      `,
      // Exported declaration with an interface return type
      `
      interface DropVerdict {
        isValid: boolean;
        reason: string;
      }
      export function canDropOnMatchCell(id: string): DropVerdict {
        return { isValid: id.length > 0, reason: '' };
      }
      const dropDecision = canDropOnMatchCell('a');
      `,
      // String literal return type
      `
      function canLabel(): 'ok' {
        return 'ok';
      }
      const label = canLabel();
      `,
      // `any` return annotation carries no verdict, so the body decides
      `
      function canInspect(id: string): any {
        return { isValid: id.length > 0 };
      }
      const inspection = canInspect('a');
      `,
      // Type assertion to a non-boolean type inside the body
      `
      const canCast = (value: unknown) => {
        return value as string;
      };
      const casted = canCast(1);
      `,
      // Sequence expression whose final operand is an object
      `
      const canSequence = (id: string) => {
        return (console.log(id), { isValid: true });
      };
      const sequenceOutcome = canSequence('a');
      `,
      // Explicit `return undefined;`
      `
      function canNoop() {
        return undefined;
      }
      const noopOutcome = canNoop();
      `,
      // Arithmetic and typeof returns are not booleans
      `
      const canMeasure = (value: string) => {
        return value.length + 1;
      };
      const measurement = canMeasure('a');
      `,
      `
      const canDescribeType = (value: unknown) => {
        return typeof value;
      };
      const typeDescription = canDescribeType(1);
      `,
      // Logical expression whose fallback is an object
      `
      const canPick = (value: unknown) => {
        return value || { isValid: false };
      };
      const picked = canPick(undefined);
      `,
      // Generator calls yield an iterator, not a boolean
      `
      function* canIterate() {
        yield true;
      }
      const iteration = canIterate();
      `,
      // Overload signature plus an implementation returning an object
      `
      function canOverload(id: string);
      function canOverload(id: string) {
        return { isValid: id.length > 0 };
      }
      const overloadOutcome = canOverload('a');
      `,
    ],
    invalid: [
      // REGRESSION GUARD: a `can*` callee that genuinely returns boolean must still be flagged
      {
        code: `
        const canReallyDrop = (id: string) => {
          return id.length > 0;
        };
        const reallyDrop = canReallyDrop('a');
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Explicit `: boolean` annotation on a resolvable callee
      {
        code: `
        function canDelete(id: string): boolean {
          return id.length > 0;
        }
        const deletable = canDelete('a');
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Arrow with a concise body returning a comparison
      {
        code: `
        const canRetry = (attempts: number) => attempts > 0;
        const retry = canRetry(1);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Ternary of boolean literals
      {
        code: `
        const canRetry = (attempts: number) => {
          return attempts > 0 ? true : false;
        };
        const retry = canRetry(1);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Negation return
      {
        code: `
        const canSkip = (value: unknown) => {
          return !value;
        };
        const skip = canSkip(1);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Type predicate return annotation is a boolean contract
      {
        code: `
        function isNonEmpty(value: unknown): value is string {
          return typeof value === 'string';
        }
        const nonEmpty = isNonEmpty(input);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Unresolvable callee (imported across modules) keeps the name heuristic
      {
        code: `
        import { canDropOnMatchCell } from './drop';
        const dropDecision = canDropOnMatchCell(source);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Undeclared callee keeps the name heuristic
      {
        code: `const completed = isTaskFinished();`,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Logical OR whose left side resolves to a boolean-returning callee
      {
        code: `
        const canReallyDrop = (id: string): boolean => id.length > 0;
        const reallyDrop = canReallyDrop('a') || fallbackFlag;
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Logical AND whose right side resolves to a boolean-returning callee
      {
        code: `
        const canReallyDrop = (id: string): boolean => id.length > 0;
        const isFlag = true;
        const reallyDrop = isFlag && canReallyDrop('a');
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Getter path: resolvable callee that genuinely returns boolean
      {
        code: `
        function canDropHere(id: string): boolean {
          return id.length > 0;
        }
        class Board {
          get dropDecision() {
            return canDropHere(this.id);
          }
        }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Getter path: unresolvable callee keeps the name heuristic
      {
        code: `
        class Validator {
          get result() {
            return isValid(this.input);
          }
        }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Boolean literal return type
      {
        code: `
        function canFlag(): true {
          return true;
        }
        const flag = canFlag();
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Union of boolean literal types is still a boolean contract
      {
        code: `
        function canFlag(): true | false {
          return true;
        }
        const flag = canFlag();
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Boxed `Boolean` return type
      {
        code: `
        function canFlag(): Boolean {
          return true;
        }
        const flag = canFlag();
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // `unknown` annotation with an opaque body keeps the name heuristic
      {
        code: `
        function canInspect(id: string): unknown {
          return cache[id];
        }
        const inspection = canInspect('a');
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Non-null assertion on an opaque member keeps the name heuristic
      {
        code: `
        const canRead = (source: { flag: unknown }) => {
          return source.flag!;
        };
        const readOutcome = canRead(input);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Overload signature whose implementation returns boolean
      {
        code: `
        function canOverload(id: string): boolean;
        function canOverload(id: string) {
          return id.length > 0;
        }
        const overloadOutcome = canOverload('a');
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Hoisted function declaration that genuinely returns boolean
      {
        code: `
        const reallyDrop = canReallyDrop('a');
        function canReallyDrop(id: string) {
          return id.length > 0;
        }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Shadowing: the innermost declaration returns boolean
      {
        code: `
        const canDrop = (id: string) => ({ isValid: id.length > 0 });
        function outer(id: string) {
          const canDrop = (dropId: string) => dropId.length > 0;
          const dropDecision = canDrop(id);
          return dropDecision;
        }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
    ],
  },
);
