import { ruleTesterTs } from '../utils/ruleTester';
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
    ],
    invalid: [
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
    ],
  },
);
