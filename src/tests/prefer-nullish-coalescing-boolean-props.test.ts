import { Linter, Rule } from 'eslint';
import * as prettier from 'prettier';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterTs, ruleTesterJson } from '../utils/ruleTester';
import { preferNullishCoalescingBooleanProps } from '../rules/prefer-nullish-coalescing-boolean-props';
import path from 'path';

const tsconfigRootDir = path.join(__dirname, '..', '..');

ruleTesterTs.run(
  'prefer-nullish-coalescing-boolean-props',
  preferNullishCoalescingBooleanProps,
  {
    valid: [
      // ===== ORIGINAL ISSUE CASE =====
      // The exact case from the bug report should be valid
      {
        code: `
        function Component() {
          return (
            <LoadingButton
              disabled={
                !isValidated.phoneNumber ||
                !hasUserTyped.phoneNumber ||
                isLoading ||
                !isPhoneInputLoaded
              }
              id="phone-dialog-recaptcha"
              size="large"
              sx={{ width: '100%' }}
              type="submit"
              variant="contained"
              onClick={attemptSubmit}
            >
              Send Code
            </LoadingButton>
          );
        }
      `,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== STANDARD BOOLEAN PROPS =====
      // Common HTML boolean attributes
      {
        code: `function Component() { return <Button disabled={isLoading || !isValid}>Submit</Button>; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input required={hasValue || isRequired} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Checkbox checked={isSelected || defaultSelected} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input readOnly={isReadOnly || isDisabled} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input autoFocus={shouldFocus || isFirst} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Video autoPlay={shouldPlay || isDemo} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Video controls={showControls || isAdmin} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Script defer={shouldDefer || isAsync} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Details open={isOpen || forceOpen} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Select multiple={allowMultiple || isArray} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Video muted={isMuted || isBackground} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Form noValidate={skipValidation || isDev} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Video loop={shouldLoop || isDemo} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Div hidden={isHidden || !isVisible} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input selected={isSelected || isDefault} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Iframe allowFullScreen={canFullscreen || isVideo} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Script async={isAsync || shouldDefer} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input autofocus={shouldFocus || isFirst} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Video autoplay={shouldPlay || isDemo} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input formNoValidate={skipValidation || isDev} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input spellcheck={checkSpelling || isText} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Div translate={shouldTranslate || isMultilingual} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Div itemScope={hasSchema || isStructured} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Object seamless={isSeamless || isEmbedded} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Details scoped={isScoped || isIsolated} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== BOOLEAN-LIKE PROP NAMES =====
      // Props that start with boolean prefixes
      {
        code: `function Component() { return <Modal isOpen={showModal || forceOpen} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Button isLoading={loading || submitting} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input hasError={error || invalid} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Form shouldValidate={validate || strict} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Button canSubmit={valid || override} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Modal willClose={autoClose || userClose} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input doValidate={validate || required} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Form doesSubmit={submit || autoSubmit} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Button didLoad={loaded || cached} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input wasValid={previousValid || defaultValid} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Form wereErrors={hadErrors || hasErrors} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Button enableSubmit={canSubmit || forceEnable} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input disableValidation={skipValidation || isDev} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== COMPLEX BOOLEAN EXPRESSIONS =====
      // Nested logical expressions in boolean contexts
      {
        code: `function Component() { return <Button disabled={(loading || submitting) && (invalid || !ready)} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input required={!optional && (required || defaultRequired)} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Form disabled={!(valid || override) || (loading || error)} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Button isLoading={loading || (submitting && !complete)} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== SELF-CLOSING TAGS =====
      {
        code: `function Component() { return <Input disabled={loading || invalid} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Checkbox checked={selected || defaultSelected} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== NON-JSX BOOLEAN CONTEXTS =====
      // Variable declarations with boolean-like names
      `const isDisabled = !isValidated.phoneNumber || !hasUserTyped.phoneNumber || isLoading;`,
      `const hasError = validationError || networkError || timeoutError;`,
      `const shouldSubmit = isValid && (userConfirmed || autoSubmit);`,
      `const canProceed = !loading || hasOverride;`,
      `const willUpdate = hasChanges || forceUpdate;`,
      `const doValidate = isRequired || hasValue;`,
      `const doesExist = found || created;`,
      `const didComplete = finished || cancelled;`,
      `const wasSuccessful = completed || skipped;`,
      `const wereErrors = hadErrors || hasNewErrors;`,

      // Control flow boolean contexts
      `if (isLoading || !isValid) { return null; }`,
      `while (isLoading || hasError) { break; }`,
      `for (let i = 0; isLoading || i < 10; i++) { }`,
      `do { process(); } while (hasMore || !complete);`,

      // Ternary operator test conditions
      `const result = (loading || error) ? 'pending' : 'ready';`,
      `const status = (valid || override) ? 'success' : 'failure';`,

      // Logical expressions in return statements of boolean functions
      `function isReady() { return loaded || cached; }`,
      `const canSubmit = () => valid || override;`,

      // Unary expressions (negation)
      `const isNotReady = !(loaded || cached);`,
      `if (!(valid || override)) { return; }`,

      // ===== MIXED WITH NULLISH COALESCING =====
      // Cases where nullish coalescing is already used correctly
      `const value = data ?? defaultValue;`,
      `const config = options?.settings ?? DEFAULT_SETTINGS;`,
      `const name = user?.profile?.name ?? 'Anonymous';`,

      // ===== LITERAL VALUES =====
      // Logical OR with non-nullish literals should be valid
      `const result = false || true;`,
      `const result = 0 || 1;`,
      `const result = '' || 'default';`,

      // ===== TYPESCRIPT-SPECIFIC CASES =====
      // Optional chaining with logical OR in boolean contexts
      {
        code: `function Component() { return <Button disabled={user?.isLoading || !user?.isValid} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `const isReady = user?.profile?.isComplete || user?.hasOverride;`,
      },

      // ===== FUNCTION CONTEXTS =====
      // Arrow functions returning boolean expressions
      `const checkStatus = () => loading || error;`,
      `const isValid = (data: any) => data.valid || data.override;`,

      // Async functions with boolean logic
      `async function canProceed() { return (await checkAuth()) || hasOverride; }`,

      // ===== REACT PATTERNS =====
      // Conditional rendering patterns (ternary operator)
      {
        code: `function Component() { return (ready || override) ? <Content /> : <Loading />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // Event handlers with boolean logic
      {
        code: `function Component() { return <Button onClick={() => (valid || override) && submit()} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== EDGE CASES =====
      // Empty expressions and whitespace
      {
        code: `function Component() { return <Button disabled={
          loading ||
          error ||
          !ready
        } />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // Comments in expressions
      {
        code: `function Component() { return <Button disabled={loading /* check loading */ || error /* check error */} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== DEEPLY NESTED COMPONENTS =====
      {
        code: `
        function Component() {
          return (
            <div>
              <form>
                <fieldset>
                  <Button disabled={loading || invalid || !ready} />
                </fieldset>
              </form>
            </div>
          );
        }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // ===== SWITCH STATEMENTS =====
      `switch (true) { case (loading || error): return 'pending'; default: return 'ready'; }`,

      // ===== ARRAY METHODS WITH BOOLEAN LOGIC =====
      `const filtered = items.filter(item => item.valid || item.override);`,
      `const hasAny = items.some(item => item.active || item.selected);`,
      `const allReady = items.every(item => item.loaded || item.cached);`,

      // ===== OBJECT METHODS =====
      `const obj = { isReady: () => loaded || cached };`,
      `const config = { validate: valid || required };`,

      // ===== CLASS METHODS =====
      `class Component { isReady() { return this.loaded || this.cached; } }`,

      // ===== DESTRUCTURING WITH BOOLEAN LOGIC =====
      `const { isValid = loading || hasDefault } = props;`,
      `const [ready, setReady] = useState(initialReady || defaultReady);`,

      // ===== REGRESSION TESTS FOR ISSUE #1125 =====
      {
        code: `
        const eitherEqual = (a: boolean, b: boolean) => {
          return a || b; 
        };
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      {
        code: `
        const eitherEqual = (a: boolean, b: boolean): boolean => {
          return a || b; 
        };
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      {
        code: `
        const result = (a: boolean | undefined, b: boolean) => {
          const x = a || b;
          return x;
        };
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      {
        code: `
        function constrained<T extends string>(a: T, b: string) {
          return a || b;
        }
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      {
        code: `
        function constrainedBool<T extends boolean>(a: T, b: boolean) {
          return a || b;
        }
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },

      // ===== REGRESSION TESTS FOR ISSUE #1513 =====
      // The parser-services guard added for non-TypeScript parsers must not disable
      // type-aware analysis under @typescript-eslint/parser. Neither operand name nor
      // surrounding syntax marks this as a boolean context, so only the type checker
      // can keep it valid.
      {
        code: `
        function combine<T extends boolean>(a: T, b: boolean) {
          const combined = a || b;
          return combined;
        }
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },

      // ===== REGRESSION TESTS FOR ISSUE #2040 =====
      // The `boolean && object` short-circuit idiom: the `||` strips the `false`
      // the `&&` produces, which `??` cannot do.
      {
        code: `
type Arrows = { next: string; prev: string };
type Options = { arrows?: Arrows };
declare const hasArrows: boolean | undefined;
declare const fallbackNext: string;
export const options: Options = {
  arrows:
    (hasArrows && {
      next: fallbackNext,
      prev: fallbackNext,
    }) ||
    undefined,
};
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      // The defect belongs to the union, not to the `&&` that usually builds it:
      // a hand-written `false | Arrows | undefined` is the same expression.
      {
        code: `
type Arrows = { next: string; prev: string };
declare const arrows: false | Arrows | undefined;
export const chosen = arrows || undefined;
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      // A string payload short-circuits the same way: `hasLabel && label` is
      // `false | undefined | string`, and `??` leaks the `false` into a `string`
      // annotation.
      {
        code: `
declare const hasLabel: boolean | undefined;
declare const label: string;
export const text: string = (hasLabel && label) || 'default';
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      // The `0 &&` sibling of the idiom: the sentinel is a numeric zero and the
      // payload is an object.
      {
        code: `
type Slide = { index: number };
declare const count: number | undefined;
declare const slide: Slide;
export const current: Slide | undefined = (count && slide) || undefined;
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
      // The `'' &&` sibling, with an object payload.
      {
        code: `
type Route = { path: string };
declare const slug: string | undefined;
declare const route: Route;
export const target: Route | undefined = (slug && route) || undefined;
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
    ],
    invalid: [
      // ===== REGRESSION TEST FOR ISSUE #1513 =====
      // Reporting and autofixing still work with full type information available.
      {
        code: `
        function withFallback(a: string | undefined, b: string) {
          const chosen = a || b;
          return chosen;
        }
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `
        function withFallback(a: string | undefined, b: string) {
          const chosen = a ?? b;
          return chosen;
        }
        `,
      },
      {
        code: `
        function generic<T>(a: T, b: boolean) {
          return a || b;
        }
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `
        function generic<T>(a: T, b: boolean) {
          return a ?? b;
        }
        `,
      },
      {
        code: `
        function test(a: void | string, b: string) {
          const x = a || b;
          return x;
        }
        `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `
        function test(a: void | string, b: string) {
          const x = a ?? b;
          return x;
        }
        `,
      },
      // ===== REGRESSION TESTS FOR ISSUE #2040 =====
      // The carve-out for a falsy sentinel must not swallow a plain nullable
      // object: no `false` sits in this union, so `??` is both safe and correct.
      {
        code: `
type Arrows = { next: string; prev: string };
type Options = { arrows?: Arrows };
declare const maybeObj: Arrows | undefined;
export const a: Options = { arrows: maybeObj || undefined };
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'maybeObj', right: 'undefined' },
          },
        ],
        output: `
type Arrows = { next: string; prev: string };
type Options = { arrows?: Arrows };
declare const maybeObj: Arrows | undefined;
export const a: Options = { arrows: maybeObj ?? undefined };
  `,
      },
      // The classic string default the rule exists for: `string` is falsy-capable
      // but is not a falsy sentinel, so the report stands.
      {
        code: `
declare const label: string | undefined;
export const text = label || 'fallback';
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'label', right: "'fallback'" },
          },
        ],
        output: `
declare const label: string | undefined;
export const text = label ?? 'fallback';
  `,
      },
      // A falsy member from the payload's own domain is the state the rule asks
      // callers to preserve, so a single-domain union keeps reporting.
      {
        code: `
declare const size: 0 | 1 | undefined;
export const chosen = size || 5;
  `,
        filename: 'src/rules/prefer-nullish-coalescing-boolean-props.ts',
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'size', right: '5' },
          },
        ],
        output: `
declare const size: 0 | 1 | undefined;
export const chosen = size ?? 5;
  `,
      },
      // ===== BASIC CASES WHERE NULLISH COALESCING SHOULD BE PREFERRED =====
      {
        code: `const value = data || defaultValue;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'data', right: 'defaultValue' },
          },
        ],
        output: `const value = data ?? defaultValue;`,
      },
      {
        code: `const config = options || {};`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'options', right: '{}' },
          },
        ],
        output: `const config = options ?? {};`,
      },
      {
        code: `const name = user.name || 'Anonymous';`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'user.name', right: "'Anonymous'" },
          },
        ],
        output: `const name = user.name ?? 'Anonymous';`,
      },
      {
        code: `function getValue() { return param || fallback; }`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'param', right: 'fallback' },
          },
        ],
        output: `function getValue() { return param ?? fallback; }`,
      },

      // ===== JSX PROPS THAT ARE NOT BOOLEAN =====
      {
        code: `function Component() { return <Form autoComplete={value || 'off'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'value', right: "'off'" },
          },
        ],
        output: `function Component() { return <Form autoComplete={value ?? 'off'} />; }`,
      },
      {
        code: `function Component() { return <Input placeholder={text || 'Enter text'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'text', right: "'Enter text'" },
          },
        ],
        output: `function Component() { return <Input placeholder={text ?? 'Enter text'} />; }`,
      },
      {
        code: `function Component() { return <Button type={buttonType || 'button'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'buttonType', right: "'button'" },
          },
        ],
        output: `function Component() { return <Button type={buttonType ?? 'button'} />; }`,
      },
      {
        code: `function Component() { return <Input value={inputValue || ''} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'inputValue', right: "''" },
          },
        ],
        output: `function Component() { return <Input value={inputValue ?? ''} />; }`,
      },
      {
        code: `function Component() { return <Img src={imageSrc || defaultImage} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'imageSrc', right: 'defaultImage' },
          },
        ],
        output: `function Component() { return <Img src={imageSrc ?? defaultImage} />; }`,
      },
      {
        code: `function Component() { return <Link href={url || '#'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'url', right: "'#'" },
          },
        ],
        output: `function Component() { return <Link href={url ?? '#'} />; }`,
      },
      {
        code: `function Component() { return <Div className={cssClass || 'default'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'cssClass', right: "'default'" },
          },
        ],
        output: `function Component() { return <Div className={cssClass ?? 'default'} />; }`,
      },
      {
        code: `function Component() { return <Input id={elementId || 'input'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'elementId', right: "'input'" },
          },
        ],
        output: `function Component() { return <Input id={elementId ?? 'input'} />; }`,
      },
      {
        code: `function Component() { return <Button title={tooltip || 'Click me'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'tooltip', right: "'Click me'" },
          },
        ],
        output: `function Component() { return <Button title={tooltip ?? 'Click me'} />; }`,
      },
      {
        code: `function Component() { return <Input name={fieldName || 'field'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'fieldName', right: "'field'" },
          },
        ],
        output: `function Component() { return <Input name={fieldName ?? 'field'} />; }`,
      },

      // ===== ASSIGNMENT EXPRESSIONS =====
      {
        code: `let result; result = data || fallback;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'data', right: 'fallback' },
          },
        ],
        output: `let result; result = data ?? fallback;`,
      },
      {
        code: `obj.prop = value || defaultValue;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'value', right: 'defaultValue' },
          },
        ],
        output: `obj.prop = value ?? defaultValue;`,
      },

      // ===== FUNCTION ARGUMENTS =====
      {
        code: `function call() { return someFunction(param || defaultParam); }`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'param', right: 'defaultParam' },
          },
        ],
        output: `function call() { return someFunction(param ?? defaultParam); }`,
      },
      {
        code: `const result = Math.max(value || 0, otherValue);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'value', right: '0' },
          },
        ],
        output: `const result = Math.max(value ?? 0, otherValue);`,
      },

      // ===== ARRAY AND OBJECT CONTEXTS =====
      {
        code: `const arr = [item || defaultItem];`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'item', right: 'defaultItem' },
          },
        ],
        output: `const arr = [item ?? defaultItem];`,
      },
      {
        code: `const obj = { key: value || defaultValue };`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'value', right: 'defaultValue' },
          },
        ],
        output: `const obj = { key: value ?? defaultValue };`,
      },

      // ===== TEMPLATE LITERALS =====
      {
        code: `const str = \`Hello \${name || 'World'}\`;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'name', right: "'World'" },
          },
        ],
        output: `const str = \`Hello \${name ?? 'World'}\`;`,
      },

      // ===== COMPLEX EXPRESSIONS =====
      {
        code: `const result = (data.field || defaultField).toString();`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'data.field', right: 'defaultField' },
          },
        ],
        output: `const result = (data.field ?? defaultField).toString();`,
      },
      {
        code: `const value = obj[key || 'defaultKey'];`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'key', right: "'defaultKey'" },
          },
        ],
        output: `const value = obj[key ?? 'defaultKey'];`,
      },

      // ===== NESTED FUNCTION CALLS =====
      {
        code: `const result = processData(transform(input || defaultInput));`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'input', right: 'defaultInput' },
          },
        ],
        output: `const result = processData(transform(input ?? defaultInput));`,
      },

      // ===== CLASS PROPERTY ASSIGNMENTS =====
      {
        code: `class MyClass { constructor() { this.prop = value || defaultValue; } }`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'value', right: 'defaultValue' },
          },
        ],
        output: `class MyClass { constructor() { this.prop = value ?? defaultValue; } }`,
      },

      // ===== ARROW FUNCTION RETURNS (NON-BOOLEAN) =====
      {
        code: `const getName = () => user.name || 'Anonymous';`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'user.name', right: "'Anonymous'" },
          },
        ],
        output: `const getName = () => user.name ?? 'Anonymous';`,
      },
      {
        code: `const getConfig = (options) => options.config || defaultConfig;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'options.config', right: 'defaultConfig' },
          },
        ],
        output: `const getConfig = (options) => options.config ?? defaultConfig;`,
      },

      // ===== DESTRUCTURING DEFAULTS (NON-BOOLEAN) =====
      {
        code: `const { title = data.title || 'Untitled' } = props;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'data.title', right: "'Untitled'" },
          },
        ],
        output: `const { title = data.title ?? 'Untitled' } = props;`,
      },

      // ===== EXPORT STATEMENTS =====
      {
        code: `export const config = userConfig || defaultConfig;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'userConfig', right: 'defaultConfig' },
          },
        ],
        output: `export const config = userConfig ?? defaultConfig;`,
      },
      {
        code: `export default options || {};`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'options', right: '{}' },
          },
        ],
        output: `export default options ?? {};`,
      },

      // ===== LITERAL NULL/UNDEFINED CASES =====
      // When left operand is literally null or undefined, should use nullish coalescing
      {
        code: `const result = null || 'fallback';`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'null', right: "'fallback'" },
          },
        ],
        output: `const result = null ?? 'fallback';`,
      },
      {
        code: `const result = undefined || 'fallback';`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'undefined', right: "'fallback'" },
          },
        ],
        output: `const result = undefined ?? 'fallback';`,
      },

      // ===== CONDITIONAL RENDERING CASES =====
      // Conditional rendering with && operator - this is a borderline case
      // In this context, || is used for boolean logic, but ?? might be more semantically correct
      {
        code: `function Component() { return (loading || error) && <Spinner />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'loading', right: 'error' },
          },
        ],
        output: `function Component() { return (loading ?? error) && <Spinner />; }`,
      },

      // ===== REGRESSION TESTS FOR ISSUE #1720 =====
      // Source parens are not part of an operand's range, so replacing the whole
      // LogicalExpression drops exactly the parens `??` makes mandatory. Every
      // operand that is itself a LogicalExpression must come back parenthesized.
      {
        code: `const value = (a || b) || c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || b', right: 'c' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a || b) ?? c;`,
      },
      {
        code: `const value = (a && b) || c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a && b', right: 'c' },
          },
        ],
        output: `const value = (a && b) ?? c;`,
      },
      {
        code: `const value = a || (b && c);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b && c' },
          },
        ],
        output: `const value = a ?? (b && c);`,
      },
      {
        code: `const value = a || (b || c);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b || c' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'b', right: 'c' },
          },
        ],
        output: `const value = a ?? (b || c);`,
      },
      // A `||` chain converts one link per pass, because the links share a range
      // and only the innermost fix survives. The converted link is parenthesized
      // so the half-converted chain still parses.
      {
        code: `const value = a || b || c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || b', right: 'c' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a ?? b) || c;`,
      },
      {
        code: `const value = a || b || c || d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || b || c', right: 'd' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || b', right: 'c' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a ?? b) || c || d;`,
      },
      {
        code: `const value = (a || b) || (c || d);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || b', right: 'c || d' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'c', right: 'd' },
          },
        ],
        output: `const value = (a || b) ?? (c || d);`,
      },
      // ===== REGRESSION TESTS FOR ISSUE #2090 =====
      // A `??` operand needs no parens: `??` chains with itself and is
      // associative, so the flat form evaluates the same operands in the same
      // order. Parenthesizing it emits text prettier deletes on the next
      // format, which is churn in a repository that runs `--fix` before review.
      {
        code: `const value = (a ?? b) || c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? b', right: 'c' },
          },
        ],
        output: `const value = a ?? b ?? c;`,
      },
      {
        code: `const value = a || (b ?? c);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b ?? c' },
          },
        ],
        output: `const value = a ?? b ?? c;`,
      },
      {
        code: `const value = (a ?? b) || (c ?? d);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? b', right: 'c ?? d' },
          },
        ],
        output: `const value = a ?? b ?? c ?? d;`,
      },
      // The parens a `||` needed to sit beside a `??` are the swap's own residue:
      // once both sides read `??` nothing separates them, so the fix claims them
      // and emits the chain flat.
      {
        code: `const value = (a || b) ?? c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? b ?? c;`,
      },
      {
        code: `const value = a ?? (b || c);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'b', right: 'c' },
          },
        ],
        output: `const value = a ?? b ?? c;`,
      },
      // Only the outermost pair goes: the `&&` inside still may not share an
      // expression with `??`, so its parens are load-bearing.
      {
        code: `const value = ((a && b) || c) ?? d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a && b', right: 'c' },
          },
        ],
        output: `const value = (a && b) ?? c ?? d;`,
      },
      // A `??` under a `&&`/`||` parent keeps the parens that parent requires;
      // dropping them here is a SyntaxError, not churn.
      {
        code: `const value = x && ((a ?? b) || c);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? b', right: 'c' },
          },
        ],
        output: `const value = x && (a ?? b ?? c);`,
      },
      // A comment in the margin between a paren and the operand has no operand
      // to travel with, and the widened span would delete it. Its presence
      // withdraws the widening: the redundant paren is the cheaper loss.
      {
        code: `const value = (/* keep me */ a || b) ?? c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (/* keep me */ a ?? b) ?? c;`,
      },
      {
        code: `const value = (a || b /* keep me */) ?? c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a ?? b /* keep me */) ?? c;`,
      },
      // Shape taken from a real consumer site
      // (functions/src/util/propagation/PropagationHandlerBuilderRtdb.ts).
      {
        code: `const value = ('k' in strategy && strategy.k) || !!strategy.t;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: {
              left: `'k' in strategy && strategy.k`,
              right: '!!strategy.t',
            },
          },
        ],
        output: `const value = ('k' in strategy && strategy.k) ?? !!strategy.t;`,
      },
      // ===== REGRESSION TESTS FOR ISSUE #2024 =====
      // The fix rebuilds the expression from its operands, so a comment written
      // between them lives inside the replaced span and used to be deleted. It
      // is carried instead, on the side of the operator it was written on.
      // The exact repro from the issue.
      {
        code: `const result = obj1.a.id || // keep me\n              obj2.b.key;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'obj1.a.id', right: 'obj2.b.key' },
          },
        ],
        output: `const result =\n  obj1.a.id ?? // keep me\n  obj2.b.key;`,
      },
      // A line comment keeps a line of its own: folding the operand onto it
      // would comment the operand out.
      {
        code: `const value = a || // keep me\n  b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value =\n  a ?? // keep me\n  b;`,
      },
      // A single-line block comment is inert beside the operand, so it rides
      // inline and the emitted line count is unchanged.
      {
        code: `const value = a || /* keep me */ b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? /* keep me */ b;`,
      },
      {
        code: `const value = a || /* keep me */\n  b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? /* keep me */ b;`,
      },
      // A comment on each side of the operator stays on its own side.
      {
        code: `const value = a /* before */ || /* after */ b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a /* before */ ?? /* after */ b;`,
      },
      {
        code: `const value = a // before\n  || b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value =\n  a // before\n  ?? b;`,
      },
      // A deleted `eslint-disable-next-line` silently re-enables whatever it
      // suppressed. Carried, it still precedes the line holding its subject.
      {
        code: `const value = a ||\n  // eslint-disable-next-line no-undef\n  b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value =\n  a ?? // eslint-disable-next-line no-undef\n  b;`,
      },
      // Source-level parentheses around an operand are outside that operand's
      // range, so the rebuild drops them along with any comment they hold.
      {
        code: `const value = (/* lead */ a) || b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = /* lead */ a ?? b;`,
      },
      // The carried comment sits in a call argument rather than at the end of a
      // statement on purpose. Prettier prints a STATEMENT-final block comment
      // after the terminator (`a ?? b; /* tail */`) and reaches that layout in
      // two passes, not one: it prints `a || (b /* tail */)` as
      // `a || b /* tail */` and only hops the comment past the `;` on the next
      // pass. A pre-image that is not itself a prettier fixed point charges this
      // fixer with churn it inherits — the emission here differs from its input
      // by the operator alone (#2106).
      {
        code: `f(a || (b /* tail */));`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `f(a ?? b /* tail */);`,
      },
      // The same comment once prettier has parked it past the terminator: it is
      // outside the expression's range, so the swap must leave it exactly where
      // the formatter put it rather than pulling it back inside.
      {
        code: `const value = a || b; /* tail */`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? b; /* tail */`,
      },
      // `return` forbids a LineTerminator before its operand, and a block
      // comment carrying one IS a LineTerminator to the grammar (#1963), so a
      // leading comment that demands its own line moves ahead of the keyword
      // rather than folding into `return`'s line.
      {
        code: `function f() {\n  return (/* multi\n  line */ a) || b;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `function f() {\n  /* multi\n  line */\n  return a ?? b;\n}`,
      },
      {
        code: `function f() {\n  return (\n  // lead\n  a) || b;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `function f() {\n  // lead\n  return a ?? b;\n}`,
      },
      // A converted link of a `||` chain is parenthesized, and inside those
      // parentheses a newline can never trigger ASI, so a carried line comment
      // rides within the replacement.
      {
        code: `const value = a || /* c */ b || d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || /* c */ b', right: 'd' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a ?? /* c */ b) || d;`,
      },
      {
        code: `const value = a || // c\n  b || d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || // c\n  b', right: 'd' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a ?? // c\n  b) || d;`,
      },
      // The comment-free fix is unchanged: the same multi-line shape collapses
      // to exactly the text it collapsed to before comments were carried.
      {
        code: `const result = obj1.a.id ||\n              obj2.b.key;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'obj1.a.id', right: 'obj2.b.key' },
          },
        ],
        output: `const result = obj1.a.id ?? obj2.b.key;`,
      },
      // A comment INSIDE an operand travels with that operand's own text and is
      // never stranded, so the surrounding rewrite is byte-identical.
      {
        code: `const value = f(/* inner */ a) || b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'f(/* inner */ a)', right: 'b' },
          },
        ],
        output: `const value = f(/* inner */ a) ?? b;`,
      },
      // ===== REGRESSION TESTS FOR ISSUE #2101 =====
      // A chain that breaks lands whole on its own lines: the fix claims the
      // line break its landing operator carries, so the FIRST operand starts a
      // line too, and every operand sits at the chain's own depth. That is the
      // shape prettier prints — measured, not assumed — and a first operand
      // left beside the `=` is text the next formatter run rewrites, which is
      // what makes it non-canonical source in a repo whose lint runs `--fix`
      // before a human reads the report.
      {
        code: `const uid = primary.id || // fall back for legacy documents\n            secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const uid =\n  primary.id ?? // fall back for legacy documents\n  secondary.id;`,
      },
      // The depth is measured from the line the expression opens on, so a chain
      // nested in a function, an object literal or a JSX attribute lands beside
      // its own statement rather than at the file's left margin.
      {
        code: `function f() {\n  const uid = primary.id || // c\n    secondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n  const uid =\n    primary.id ?? // c\n    secondary.id;\n}`,
      },
      {
        code: `function f() {\n  if (x) {\n    const uid = primary.id || // c\n      secondary.id;\n  }\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n  if (x) {\n    const uid =\n      primary.id ?? // c\n      secondary.id;\n  }\n}`,
      },
      {
        code: `const o = {\n  k: primary.id || // c\n    secondary.id,\n};`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const o = {\n  k:\n    primary.id ?? // c\n    secondary.id,\n};`,
      },
      // A JSX attribute is NOT one of the operators the chain takes a line
      // break from: prettier answers a multi-line attribute value by breaking
      // the whole opening element onto one attribute per line, which is a
      // rewrite of text this fix does not own. The operand stays beside the
      // brace rather than being handed half of a layout the fix cannot finish.
      {
        code: `function Component() {\n  return (\n    <Input placeholder={text || // c\n      fallback} />\n  );\n}`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'text', right: 'fallback' },
          },
        ],
        output: `function Component() {\n  return (\n    <Input placeholder={text ?? // c\n      fallback} />\n  );\n}`,
      },
      // The step matches the indentation already in use, so a tab-indented file
      // is not handed a space-indented continuation.
      {
        code: `function f() {\n\tconst uid = primary.id || // c\n\t\tsecondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n\tconst uid =\n\t\tprimary.id ?? // c\n\t\tsecondary.id;\n}`,
      },
      // An expression that already opens its own line is a chain at its landing
      // depth: it keeps that line's indentation, and the fix is a fixed point of
      // prettier's canonical layout for a comment-bearing chain.
      {
        code: `const uid =\n  primary.id || // fall back for legacy documents\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const uid =\n  primary.id ?? // fall back for legacy documents\n  secondary.id;`,
      },
      {
        code: `function f() {\n  const uid =\n    primary.id || // c\n    secondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n  const uid =\n    primary.id ?? // c\n    secondary.id;\n}`,
      },
      // Prettier prints every operand of a comment-broken chain on a line of its
      // own. A link converted by an earlier pass carries the comment inside its
      // own text, so the operand joined to it takes a line rather than being
      // folded back onto the one above.
      {
        code: `const value = (a ?? // c\n  b) || d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? // c\n  b', right: 'd' },
          },
        ],
        output: `const value =\n  a ?? // c\n  b ??\n  d;`,
      },
      {
        code: `const value =\n  (a ?? // c\n  b) ||\n  d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? // c\n  b', right: 'd' },
          },
        ],
        output: `const value =\n  a ?? // c\n  b ??\n  d;`,
      },
      // A comment carried onto the operator's line already separates the two
      // operands it sits between, so no second break is added beside it — but
      // the chain is ONE prettier group, so the gap the comment does not touch
      // takes its own break rather than leaving two operands packed onto one
      // line (#2106).
      {
        code: `const value = (a ?? b) || // c\n  d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? b', right: 'd' },
          },
        ],
        output: `const value =\n  a ??\n  b ?? // c\n  d;`,
      },
      // ===== REGRESSION FIXTURES FOR ISSUE #2106 =====
      // Prettier lays a logical chain out as ONE group: once it breaks, every
      // operand takes a line of its own, at the depth of the line the group
      // opens on. Each shape below is the prettier-canonical spelling of an
      // input the converged emission used to re-flow.
      //
      // A link an earlier pass already converted carries its own text, written
      // when it still sat behind parentheses one level deeper. Splicing it into
      // the chain has to re-flow it, not copy it.
      {
        code: `const value =\n  (a ?? // c\n    b) ||\n  d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? // c\n    b', right: 'd' },
          },
        ],
        output: `const value =\n  a ?? // c\n  b ??\n  d;`,
      },
      // The comment lands in the LAST gap, so the earlier gap is the one that
      // would otherwise keep two operands packed onto one line.
      {
        code: `const value =\n  (a ?? b) || // c\n  d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? b', right: 'd' },
          },
        ],
        output: `const value =\n  a ??\n  b ?? // c\n  d;`,
      },
      // A call argument and an array element take prettier's `indent(rest)`:
      // the argument's own indentation positions the chain's FIRST operand, and
      // every later operand sits one step further in.
      {
        code: `f(\n  primary.id || // c\n    secondary.id,\n);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `f(\n  primary.id ?? // c\n    secondary.id,\n);`,
      },
      {
        code: `function g() {\n  f(\n    primary.id || // c\n      secondary.id,\n  );\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function g() {\n  f(\n    primary.id ?? // c\n      secondary.id,\n  );\n}`,
      },
      {
        code: `const a = [\n  primary.id || // c\n    secondary.id,\n];`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const a = [\n  primary.id ?? // c\n    secondary.id,\n];`,
      },
      // Both effects at once: a spliced link inside a call argument, so the
      // flattened operands land one step in from the argument's own column.
      {
        code: `f(\n  (a ?? // c\n    b) ||\n    d,\n);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? // c\n    b', right: 'd' },
          },
        ],
        output: `f(\n  a ?? // c\n    b ??\n    d,\n);`,
      },
      {
        code: `const a = [\n  (x ?? // c\n    y) ||\n    z,\n];`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'x ?? // c\n    y', right: 'z' },
          },
        ],
        output: `const a = [\n  x ?? // c\n    y ??\n    z,\n];`,
      },
      // The opposite direction, and the reason a constant step cannot serve
      // both: an assignment has already taken the chain's step, so its operands
      // stay FLUSH with the first one. A comment written ahead of the chain
      // rides inside the chain's own group, so it does not make the chain a
      // continuation of the line it shares.
      {
        code: `const uid =\n  /* pin */ primary.id || // c\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const uid =\n  /* pin */ primary.id ?? // c\n  secondary.id;`,
      },
      {
        code: `const o = {\n  k:\n    /* pin */ primary.id || // c\n    secondary.id,\n};`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const o = {\n  k:\n    /* pin */ primary.id ?? // c\n    secondary.id,\n};`,
      },
      // A link whose parentheses the swap makes redundant lands at the PAREN's
      // column, not the operand's, so the depth is measured from where the
      // emission starts rather than from where the node does.
      {
        code: `const v =\n  q ??\n  (aa || // c\n    bb);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'aa', right: 'bb' },
          },
        ],
        output: `const v =\n  q ??\n  aa ?? // c\n  bb;`,
      },
      // The break that governs this link sits in a gap the link does not own:
      // it belongs to the enclosing `??` chain, which absorbs this one into its
      // group. Asking only the reported link leaves two operands on one line.
      {
        code: `const v =\n  q ??\n  (aa ||\n    bb || // c\n    cc);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'aa ||\n    bb', right: 'cc' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'aa', right: 'bb' },
          },
        ],
        output: `const v =\n  q ??\n  (aa ||\n    bb) ?? // c\n  cc;`,
      },
      // Every operator a chain lands after takes the break, and each was
      // measured against prettier rather than reasoned about: an assignment,
      // a compound assignment, a class field, an arrow body, a plain and a
      // computed object key, and a declaration carrying a type annotation.
      {
        code: `obj.field = primary.id || // c\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `obj.field =\n  primary.id ?? // c\n  secondary.id;`,
      },
      {
        code: `function f() {\n  obj.field = primary.id || // c\n    secondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n  obj.field =\n    primary.id ?? // c\n    secondary.id;\n}`,
      },
      {
        code: `x ||= primary.id || // c\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `x ||=\n  primary.id ?? // c\n  secondary.id;`,
      },
      {
        code: `class K {\n  p = primary.id || // c\n    secondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `class K {\n  p =\n    primary.id ?? // c\n    secondary.id;\n}`,
      },
      {
        code: `const g = () => primary.id || // c\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const g = () =>\n  primary.id ?? // c\n  secondary.id;`,
      },
      {
        code: `function f() {\n  const g = () => primary.id || // c\n    secondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n  const g = () =>\n    primary.id ?? // c\n    secondary.id;\n}`,
      },
      {
        code: `const o = {\n  [k]: primary.id || // c\n    secondary.id,\n};`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const o = {\n  [k]:\n    primary.id ?? // c\n    secondary.id,\n};`,
      },
      {
        code: `const uid: string = primary.id || // c\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const uid: string =\n  primary.id ?? // c\n  secondary.id;`,
      },
      // Three object levels deep, the break and the operands land at the key's
      // own depth plus one step, not at the depth of any enclosing brace.
      {
        code: `const o = {\n  a: {\n    b: {\n      c: primary.id || // c\n        secondary.id,\n    },\n  },\n};`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const o = {\n  a: {\n    b: {\n      c:\n        primary.id ?? // c\n        secondary.id,\n    },\n  },\n};`,
      },
      // `return`, `throw` and `yield` are absent from the landing shapes on
      // purpose. Prettier answers a broken chain after one of them by
      // PARENTHESIZING it, and parentheses are tokens: emitting them because a
      // comment is present would let the comment change the program, which is
      // the invariant the whole comment-carrying path is built on. The operand
      // stays beside the keyword, where the grammar's restricted production
      // needs it.
      {
        code: `function f() {\n  return primary.id || // c\n    secondary.id;\n}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f() {\n  return primary.id ?? // c\n    secondary.id;\n}`,
      },
      // An argument, an array element and a parameter default are absent too.
      // Prettier never breaks between the punctuation that introduces one and
      // the chain's first operand; it answers a chain too wide for the line by
      // breaking the enclosing LIST and indenting the chain one step further,
      // which is a rewrite of text outside the expression this fix owns.
      {
        code: `f(primary.id || // c\n  secondary.id);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `f(primary.id ?? // c\n  secondary.id);`,
      },
      {
        code: `const a = [primary.id || // c\n  secondary.id];`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const a = [primary.id ?? // c\n  secondary.id];`,
      },
      {
        code: `function f(p = primary.id || // c\n  secondary.id) {}`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `function f(p = primary.id ?? // c\n  secondary.id) {}`,
      },
      // The widened span swallows the gap between the operator and the chain,
      // so a comment written in that gap withdraws the widening rather than
      // being deleted by it — the same discipline the redundant-paren widening
      // keeps. Prettier does break this one (it prints `/* pin */` on the
      // chain's first line), so the emission stays non-canonical; deleting a
      // comment to reach the formatter's layout is the worse of the two.
      {
        code: `const uid = /* pin */ primary.id || // c\n  secondary.id;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'primary.id', right: 'secondary.id' },
          },
        ],
        output: `const uid = /* pin */ primary.id ?? // c\n  secondary.id;`,
      },
      // A comment TRAILING the whole expression is outside the chain, so it
      // breaks nothing the chain owns and the operands stay where they were.
      {
        code: `const value = a || (b // tail\n);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? b // tail\n;`,
      },
      // A comment nested inside an operand's own brackets belongs to that
      // operand's layout: the chain stays on one line, exactly as prettier
      // prints it, so an operand carrying a multi-line argument is not split.
      {
        code: `const v = f({\n  a: 1, // note\n}) || b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'f({\n  a: 1, // note\n})', right: 'b' },
          },
        ],
        output: `const v = f({\n  a: 1, // note\n}) ?? b;`,
      },
      {
        code: `const v = f({\n  a: 1,\n}) || b;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'f({\n  a: 1,\n})', right: 'b' },
          },
        ],
        output: `const v = f({\n  a: 1,\n}) ?? b;`,
      },
      // A single-line block comment between the operands disturbs neither, so
      // the chain keeps its one line and gains no indentation.
      {
        code: `const value = a || /* keep */ b || d;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a || /* keep */ b', right: 'd' },
          },
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = (a ?? /* keep */ b) || d;`,
      },
      // Text resuming after the expression belongs to the statement, so the
      // break a trailing line comment forces returns to the opening line's
      // depth rather than the chain body's.
      {
        code: `const value = a || (b // tail\n);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? b // tail\n;`,
      },
    ],
  },
);

// ===== REGRESSION TESTS FOR ISSUE #1513 =====
// Non-TypeScript parsers expose no parser services. An eager getParserServices call
// throws there, and a throw at rule-load time fails the ENTIRE lint run for the file
// ("Error while loading rule ..."), not just this rule. The rule must degrade to its
// syntactic analysis instead.
ruleTesterJson.run(
  'prefer-nullish-coalescing-boolean-props (jsonc parser)',
  preferNullishCoalescingBooleanProps as unknown as Rule.RuleModule,
  {
    valid: [
      {
        code: `{"name": "example", "version": "1.0.0", "dependencies": {"eslint": "8.19.0"}}`,
        filename: 'package.json',
      },
    ],
    invalid: [],
  },
);

describe('prefer-nullish-coalescing-boolean-props without TypeScript parser services', () => {
  const lintWithDefaultParser = () => {
    const linter = new Linter();
    linter.defineRule(
      '@blumintinc/blumint/prefer-nullish-coalescing-boolean-props',
      preferNullishCoalescingBooleanProps as unknown as Rule.RuleModule,
    );
    return linter.verify(
      'const value = data || fallback;',
      {
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: {
          '@blumintinc/blumint/prefer-nullish-coalescing-boolean-props':
            'error',
        },
      },
      'example.js',
    );
  };

  it('does not fail the lint run for a .js file parsed by espree', () => {
    expect(lintWithDefaultParser).not.toThrow();
  });

  it('still applies the syntactic analysis without type information', () => {
    const messages = lintWithDefaultParser();
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe('preferNullishCoalescing');
    expect(messages[0].fatal).toBeUndefined();
  });
});

// ===== REGRESSION TESTS FOR ISSUE #1720 =====
// The defect is in the *emitted program*, not in any single report: `??` cannot
// share an expression with an unparenthesized `&&`/`||`, so a per-report
// `output:` comparison passes while `--fix` writes source that does not parse.
// These cases assert the whole fixed program re-parses.
describe('prefer-nullish-coalescing-boolean-props emits parseable code', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-nullish-coalescing-boolean-props';

  const fixAll = (code: string) => {
    const linter = new Linter();
    linter.defineRule(
      RULE_ID,
      preferNullishCoalescingBooleanProps as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      },
      'example.js',
    );
  };

  const LOGICAL_OPERAND_CASES = [
    `const value = (a || b) || c;`,
    `const value = (a && b) || c;`,
    `const value = a || (b && c);`,
    `const value = a || (b || c);`,
    `const value = a || b || c;`,
    `const value = a || b || c || d;`,
    `const value = (a || b) || (c || d);`,
    `const value = (a ?? b) || c;`,
    `const value = a || (b ?? c);`,
    `const value = x && (a || b);`,
    `const value = cond ? (a || b) || c : d;`,
    `const value = g((a && b) || c, other);`,
    `const value = () => (a || b) || c;`,
    `const value = ('k' in strategy && strategy.k) || !!strategy.t;`,
    // Shapes whose parentheses the swap makes redundant (#2090). Dropping a
    // pair is only safe where the grammar tolerates the flat chain, so every
    // one of them is driven to convergence and re-parsed.
    `const value = (a || b) ?? c;`,
    `const value = a ?? (b || c);`,
    `const value = (a ?? b) || (c ?? d);`,
    `const value = ((a && b) || c) ?? d;`,
    `const value = a ?? ((b && c) || d);`,
    `const value = x && ((a ?? b) || c);`,
    `const value = x || (a || b);`,
    `const value = ((a || b) || c).toString();`,
    'const value = `x${a || b || c}`;',
    `const value = (/* keep me */ a || b) ?? c;`,
    `const value = (a || b /* keep me */) ?? c;`,
    // Partial-chain shape from a real consumer site (src/middleware.ts).
    `async function middleware(request) {
  return (
    adsRedirectMiddleware(request) ||
    withPrependUtc(request)(
      parkingMiddleware(request) ||
        gameMiddleware(request) ||
        deduceIsItemMiddleware(request) ||
        (await resolveUsernameSlugMiddleware(request)) ||
        profileMiddleware(request) ||
        (await shortenedUrlMiddleware(request)) ||
        (await rejectUnauthenticatedMiddleware(request)) ||
        NextResponse.next(),
    )
  );
}`,
  ];

  it.each(LOGICAL_OPERAND_CASES)(
    'produces output that re-parses: %s',
    (code) => {
      const { output, messages } = fixAll(code);
      const fatal = messages.filter((message) => message.fatal);
      expect({ code, output, fatal }).toEqual({ code, output, fatal: [] });
    },
  );

  // Non-vacuity: the assertion above only means something if the fixer actually
  // rewrote these inputs. A rule that reported nothing would pass it trivially.
  it('rewrites every logical-operand case it is handed', () => {
    const unfixed = LOGICAL_OPERAND_CASES.filter((code) => !fixAll(code).fixed);
    expect(unfixed).toEqual([]);
  });

  // Positive control: the exact string the pre-fix fixer emitted must be seen as
  // a fatal parse error, proving the harness can detect the defect it guards.
  it('detects a mixed ?? / || program as a fatal parse error', () => {
    const { messages } = fixAll('const value = a || b ?? c;');
    expect(messages.some((message) => message.fatal)).toBe(true);
  });

  // ===== REGRESSION TESTS FOR ISSUE #2090 =====
  // A per-report `output:` only pins one pass, and a `||` chain converts one
  // link per pass — the redundant parens appear at the END of that sequence.
  // These pin the CONVERGED text, so neither a paren the swap makes redundant
  // nor one the grammar demands can drift.
  //
  // Each pair is one direction of the same question: the left column is what
  // `--fix` writes, and every entry with parentheses in it keeps them because
  // `??` may not share an expression with an unparenthesized `&&`/`||`. The
  // parse assertion above covers the same inputs, so an over-eager removal
  // fails twice: once as wrong text, once as a fatal parse.
  const CONVERGED_CASES: [string, string][] = [
    // Redundant: `??` chains with itself, so the flat form is the canonical one.
    [`const value = a || b || c;`, `const value = a ?? b ?? c;`],
    [`const value = a || b || c || d;`, `const value = a ?? b ?? c ?? d;`],
    [`const value = (a || b) || c;`, `const value = a ?? b ?? c;`],
    [`const value = a || (b || c);`, `const value = a ?? b ?? c;`],
    [`const value = (a || b) || (c || d);`, `const value = a ?? b ?? c ?? d;`],
    [`const value = (a ?? b) || c;`, `const value = a ?? b ?? c;`],
    [`const value = a || (b ?? c);`, `const value = a ?? b ?? c;`],
    [`const value = (a ?? b) || (c ?? d);`, `const value = a ?? b ?? c ?? d;`],
    [`const value = (a || b) ?? c;`, `const value = a ?? b ?? c;`],
    [`const value = a ?? (b || c);`, `const value = a ?? b ?? c;`],
    [`const value = x || (a || b);`, `const value = x ?? a ?? b;`],
    [
      `const value = ((a || b) || c).toString();`,
      `const value = (a ?? b ?? c).toString();`,
    ],
    [`const value = () => (a || b) || c;`, `const value = () => a ?? b ?? c;`],
    [
      `const value = cond ? (a || b) || c : d;`,
      `const value = cond ? a ?? b ?? c : d;`,
    ],
    ['const value = `x${a || b || c}`;', 'const value = `x${a ?? b ?? c}`;'],
    // Required: removing any of these parens is a SyntaxError, not churn.
    [`const value = (a && b) || c;`, `const value = (a && b) ?? c;`],
    [`const value = a || (b && c);`, `const value = a ?? (b && c);`],
    [`const value = x && (a || b);`, `const value = x && (a ?? b);`],
    [
      `const value = x && ((a ?? b) || c);`,
      `const value = x && (a ?? b ?? c);`,
    ],
    [
      `const value = ((a && b) || c) ?? d;`,
      `const value = (a && b) ?? c ?? d;`,
    ],
    [
      `const value = a ?? ((b && c) || d);`,
      `const value = a ?? (b && c) ?? d;`,
    ],
    [
      `const value = g((a && b) || c, other);`,
      `const value = g((a && b) ?? c, other);`,
    ],
    // A comment in the margin between a paren and the operand has no operand to
    // travel with, so the parens stay rather than take the comment with them.
    [
      `const value = (/* keep me */ a || b) ?? c;`,
      `const value = (/* keep me */ a ?? b) ?? c;`,
    ],
    [
      `const value = (a || b /* keep me */) ?? c;`,
      `const value = (a ?? b /* keep me */) ?? c;`,
    ],
  ];

  it.each(CONVERGED_CASES)('converges %s to %s', (code, expected) => {
    expect(fixAll(code).output).toBe(expected);
  });

  // Non-vacuity: every pair must be a rewrite the fixer actually performed.
  // A table of unchanged inputs would assert nothing.
  it('rewrites every converged case it is handed', () => {
    const unchanged = CONVERGED_CASES.filter(
      ([code]) => code === fixAll(code).output,
    );
    expect(unchanged).toEqual([]);
  });
});

// ===== REGRESSION TESTS FOR ISSUE #2101 =====
// The fixtures above pin the exact emission; this block asks the formatter
// itself whether that emission is text it would leave alone. agora's canonical
// lint runs `eslint --fix` and then checks formatting, so an emission the
// formatter rewrites lands non-canonical source in the repository before a
// human reads the report.
//
// The repo ships prettier 2.7.1 and agora runs 2.8.8. Both were measured on
// every shape below and printed them identically, so the local binary is a
// faithful stand-in for the consumer's here.
describe('prefer-nullish-coalescing-boolean-props: a broken chain is a prettier fixed point (issue #2101)', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-nullish-coalescing-boolean-props';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser('ts', tsParser as never);
    linter.defineRule(
      RULE_ID,
      preferNullishCoalescingBooleanProps as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      },
      'example.ts',
    );
  };

  // The repository's own .prettierrc.json, spelled out so a change to it shows
  // up here as a failing measurement rather than as a silently moved goalpost.
  const format = (code: string) =>
    prettier.format(code, {
      parser: 'typescript',
      semi: true,
      trailingComma: 'all',
      singleQuote: true,
      printWidth: 80,
      tabWidth: 2,
    });

  // Every landing shape the fix claims a line break from, at more than one
  // nesting depth. `\n` terminators are the formatter's own convention.
  const LANDING_CASES: [string, string][] = [
    // The issue's verbatim reproduction.
    [
      `const uid = primary.id || // fall back for legacy documents\n            secondary.id;\n`,
      `const uid =\n  primary.id ?? // fall back for legacy documents\n  secondary.id;\n`,
    ],
    [
      `function f() {\n  const uid = primary.id || // c\n    secondary.id;\n}\n`,
      `function f() {\n  const uid =\n    primary.id ?? // c\n    secondary.id;\n}\n`,
    ],
    [
      `function f() {\n  if (x) {\n    const uid = primary.id || // c\n      secondary.id;\n  }\n}\n`,
      `function f() {\n  if (x) {\n    const uid =\n      primary.id ?? // c\n      secondary.id;\n  }\n}\n`,
    ],
    [
      `const o = {\n  k: primary.id || // c\n    secondary.id,\n};\n`,
      `const o = {\n  k:\n    primary.id ?? // c\n    secondary.id,\n};\n`,
    ],
    [
      `const o = {\n  a: {\n    b: {\n      c: primary.id || // c\n        secondary.id,\n    },\n  },\n};\n`,
      `const o = {\n  a: {\n    b: {\n      c:\n        primary.id ?? // c\n        secondary.id,\n    },\n  },\n};\n`,
    ],
    [
      `obj.field = primary.id || // c\n  secondary.id;\n`,
      `obj.field =\n  primary.id ?? // c\n  secondary.id;\n`,
    ],
    [
      `function f() {\n  obj.field = primary.id || // c\n    secondary.id;\n}\n`,
      `function f() {\n  obj.field =\n    primary.id ?? // c\n    secondary.id;\n}\n`,
    ],
    [
      `class K {\n  p = primary.id || // c\n    secondary.id;\n}\n`,
      `class K {\n  p =\n    primary.id ?? // c\n    secondary.id;\n}\n`,
    ],
    [
      `const g = () => primary.id || // c\n  secondary.id;\n`,
      `const g = () =>\n  primary.id ?? // c\n  secondary.id;\n`,
    ],
    [
      `const uid: string = primary.id || // c\n  secondary.id;\n`,
      `const uid: string =\n  primary.id ?? // c\n  secondary.id;\n`,
    ],
    // A chain of three operands converts one link per pass; the converged text
    // carries every operand on its own line, at two nesting depths.
    [
      `const value = a || // c\n  b || d;\n`,
      `const value =\n  a ?? // c\n  b ??\n  d;\n`,
    ],
    [
      `function f() {\n  const value = a || // c\n    b || d;\n}\n`,
      `function f() {\n  const value =\n    a ?? // c\n    b ??\n    d;\n}\n`,
    ],
  ];

  it.each(LANDING_CASES)('emits a prettier fixed point for %s', (code) => {
    const { output } = lint(code);
    expect(format(output)).toBe(output);
  });

  it.each(LANDING_CASES)('converges %s to %s', (code, expected) => {
    expect(lint(code).output).toBe(expected);
  });

  // Non-vacuity. A table the rule declined, or one whose entries were already
  // the answer, would satisfy both assertions above for free.
  it('rewrites every case it is handed', () => {
    const unchanged = LANDING_CASES.filter(
      ([code]) => !lint(code).fixed || lint(code).output === code,
    );
    expect(unchanged).toEqual([]);
  });

  it('measures more than a handful of shapes', () => {
    expect(LANDING_CASES.length).toBeGreaterThanOrEqual(12);
  });

  // Planted positive control: the verbatim emission of the pre-fix fixer. Both
  // halves matter — it re-lints CLEAN, so a report-counting guard scores it a
  // success, while the formatter rewrites it on sight.
  it('would have caught the bug: the un-broken emission is rejected by the oracle', () => {
    const previousEmission = `const uid = primary.id ?? // fall back for legacy documents\n  secondary.id;\n`;
    expect(lint(previousEmission).fixed).toBe(false);
    expect(format(previousEmission)).not.toBe(previousEmission);
    expect(format(previousEmission)).toBe(LANDING_CASES[0][1]);
  });

  // Planted negative control: a chain that already opens its own line is at its
  // landing depth already, so the fix re-emits it byte-for-byte and does not
  // stack a second break on the one the input carries.
  it('leaves a chain that already opens its own line byte-for-byte alone', () => {
    const code = `const uid =\n  primary.id || // fall back for legacy documents\n  secondary.id;\n`;
    const expected = `const uid =\n  primary.id ?? // fall back for legacy documents\n  secondary.id;\n`;
    expect(format(code)).toBe(code);
    const { output } = lint(code);
    expect(output).toBe(expected);
    expect(format(output)).toBe(output);
  });
});

// ===== REGRESSION TESTS FOR ISSUE #2106 =====
// #2101 pinned the LANDING break. This block pins the two things that decide
// where the operands then sit: how deep the chain's tail is indented, and how
// many of its gaps take a break. Prettier prints a binaryish chain as one
// group, so a chain that breaks anywhere breaks EVERYWHERE — and it prints that
// group as `group([first, indent(rest)])` except where the construct
// introducing the chain has already taken that step. An emission that packs two
// operands onto a line, or that indents the tail by a constant, is text agora's
// prettier rewrites the moment `eslint --fix` hands it over.
//
// Both prettier 2.7.1 (this repo) and 2.8.8 (agora) were measured on every
// shape below and printed each identically, so the local binary stands in for
// the consumer's.
describe('prefer-nullish-coalescing-boolean-props: chain depth and gap breaks are a prettier fixed point (issue #2106)', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-nullish-coalescing-boolean-props';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser('ts', tsParser as never);
    linter.defineRule(
      RULE_ID,
      preferNullishCoalescingBooleanProps as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      },
      'example.ts',
    );
  };

  const format = (code: string) =>
    prettier.format(code, {
      parser: 'typescript',
      semi: true,
      trailingComma: 'all',
      singleQuote: true,
      printWidth: 80,
      tabWidth: 2,
    });

  // Each entry is the PRETTIER-CANONICAL spelling of its input, so a failure is
  // the fixer's churn and never churn the fixture arrived carrying.
  const DEPTH_CASES: [string, string][] = [
    // A link converted by an earlier pass carries text written one level deeper,
    // from when parentheses still held it there. Splicing it in re-flows it.
    [
      `const value =\n  (a ?? // c\n    b) ||\n  d;\n`,
      `const value =\n  a ?? // c\n  b ??\n  d;\n`,
    ],
    // The comment sits in the LAST gap; the earlier gap still takes a break.
    [
      `const value =\n  (a ?? b) || // c\n  d;\n`,
      `const value =\n  a ??\n  b ?? // c\n  d;\n`,
    ],
    // A call argument, an array element and a nested call all take
    // `indent(rest)`: the tail sits one step past the chain's own first operand.
    [
      `f(\n  primary.id || // c\n    secondary.id,\n);\n`,
      `f(\n  primary.id ?? // c\n    secondary.id,\n);\n`,
    ],
    [
      `function g() {\n  f(\n    primary.id || // c\n      secondary.id,\n  );\n}\n`,
      `function g() {\n  f(\n    primary.id ?? // c\n      secondary.id,\n  );\n}\n`,
    ],
    [
      `const a = [\n  primary.id || // c\n    secondary.id,\n];\n`,
      `const a = [\n  primary.id ?? // c\n    secondary.id,\n];\n`,
    ],
    // Both effects together: a spliced link inside a call argument.
    [
      `f(\n  (a ?? // c\n    b) ||\n    d,\n);\n`,
      `f(\n  a ?? // c\n    b ??\n    d,\n);\n`,
    ],
    [
      `const a = [\n  (x ?? // c\n    y) ||\n    z,\n];\n`,
      `const a = [\n  x ?? // c\n    y ??\n    z,\n];\n`,
    ],
    // The opposite direction. An assignment and an object value have already
    // spent the chain's step, so the tail stays FLUSH — which is why a constant
    // indent cannot answer both this and the argument cases above.
    [
      `const uid =\n  /* pin */ primary.id || // c\n  secondary.id;\n`,
      `const uid =\n  /* pin */ primary.id ?? // c\n  secondary.id;\n`,
    ],
    [
      `const o = {\n  k:\n    /* pin */ primary.id || // c\n    secondary.id,\n};\n`,
      `const o = {\n  k:\n    /* pin */ primary.id ?? // c\n    secondary.id,\n};\n`,
    ],
    // A block comment prettier keeps beside the operand it trails, so the swap
    // is the only difference between input and emission.
    [`f(a || b /* tail */);\n`, `f(a ?? b /* tail */);\n`],
    // A link nested in a longer `??` chain: the depth is the claimed paren's,
    // and the break that governs the link lives in a gap the link does not own.
    [
      `const v =\n  q ??\n  (aa || // c\n    bb);\n`,
      `const v =\n  q ??\n  aa ?? // c\n  bb;\n`,
    ],
    [
      `const v =\n  q ??\n  (aa ||\n    bb || // c\n    cc);\n`,
      `const v =\n  q ??\n  aa ??\n  bb ?? // c\n  cc;\n`,
    ],
  ];

  it.each(DEPTH_CASES)('emits a prettier fixed point for %s', (code) => {
    const { output } = lint(code);
    expect(format(output)).toBe(output);
  });

  it.each(DEPTH_CASES)('converges %s to %s', (code, expected) => {
    expect(lint(code).output).toBe(expected);
  });

  // Non-vacuity, three ways. The table must be prettier-canonical going IN (or
  // the oracle is measuring the fixture's own churn), every entry must be a
  // rewrite the fixer actually performed, and the table must cover both
  // indentation directions rather than one of them twice.
  it('feeds the oracle only prettier-canonical inputs', () => {
    const churning = DEPTH_CASES.filter(([code]) => format(code) !== code);
    expect(churning).toEqual([]);
  });

  it('rewrites every case it is handed', () => {
    const unchanged = DEPTH_CASES.filter(
      ([code]) => !lint(code).fixed || lint(code).output === code,
    );
    expect(unchanged).toEqual([]);
  });

  it('covers both indentation directions and more than a handful of shapes', () => {
    expect(DEPTH_CASES.length).toBeGreaterThanOrEqual(12);
    const tailDeeper = DEPTH_CASES.filter(([, expected]) =>
      /\n {4}secondary\.id|\n {6}secondary\.id|\n {4}[bdyz] \?\?|\n {4}[dz],/.test(
        expected,
      ),
    );
    const tailFlush = DEPTH_CASES.filter(([, expected]) =>
      /\n {2}secondary\.id;|\n {4}secondary\.id,\n};|\n {2}b \?\?|\n {2}d;/.test(
        expected,
      ),
    );
    expect(tailDeeper.length).toBeGreaterThanOrEqual(4);
    expect(tailFlush.length).toBeGreaterThanOrEqual(4);
  });

  // Planted positive controls: the verbatim emissions of the pre-fix fixer. Each
  // re-lints CLEAN, so a report-counting guard scores it a success, while the
  // formatter rewrites it on sight — and rewrites it INTO the table's answer.
  it.each([
    [
      `const value =\n  a ?? b ?? // c\n  d;\n`,
      `const value =\n  a ??\n  b ?? // c\n  d;\n`,
    ],
    [
      `const value =\n  a ?? // c\n    b ??\n  d;\n`,
      `const value =\n  a ?? // c\n  b ??\n  d;\n`,
    ],
    [
      `f(\n  primary.id ?? // c\n  secondary.id,\n);\n`,
      `f(\n  primary.id ?? // c\n    secondary.id,\n);\n`,
    ],
    [
      `const uid =\n  /* pin */ primary.id ?? // c\n    secondary.id;\n`,
      `const uid =\n  /* pin */ primary.id ?? // c\n  secondary.id;\n`,
    ],
    [
      `const v =\n  q ??\n  aa ?? bb ?? // c\n  cc;\n`,
      `const v =\n  q ??\n  aa ??\n  bb ?? // c\n  cc;\n`,
    ],
  ])(
    'would have caught the bug: %s is rejected by the oracle',
    (previousEmission, canonical) => {
      expect(lint(previousEmission).fixed).toBe(false);
      expect(format(previousEmission)).not.toBe(previousEmission);
      expect(format(previousEmission)).toBe(canonical);
    },
  );

  // Planted negative control: an already-canonical emission must be re-emitted
  // byte-for-byte, so the depth model cannot pass by re-indenting everything.
  it('leaves an already-canonical chain byte-for-byte alone', () => {
    const code = `f(\n  primary.id ?? // c\n    secondary.id,\n);\n`;
    expect(format(code)).toBe(code);
    expect(lint(code).fixed).toBe(false);
    expect(lint(code).output).toBe(code);
  });
});
