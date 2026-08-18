import { Linter, Rule } from 'eslint';
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
      // An operand that is already `??` needs no parens for legality, but keeping
      // them is harmless and preserves the author's grouping verbatim.
      {
        code: `const value = (a ?? b) || c;`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a ?? b', right: 'c' },
          },
        ],
        output: `const value = (a ?? b) ?? c;`,
      },
      {
        code: `const value = a || (b ?? c);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b ?? c' },
          },
        ],
        output: `const value = a ?? (b ?? c);`,
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
        output: `const result = obj1.a.id ?? // keep me\nobj2.b.key;`,
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
        output: `const value = a ?? // keep me\nb;`,
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
        output: `const value = a // before\n?? b;`,
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
        output: `const value = a ?? // eslint-disable-next-line no-undef\nb;`,
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
      {
        code: `const value = a || (b /* tail */);`,
        errors: [
          {
            messageId: 'preferNullishCoalescing',
            data: { left: 'a', right: 'b' },
          },
        ],
        output: `const value = a ?? b /* tail */;`,
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
        output: `const value = (a ?? // c\nb) || d;`,
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
});
