import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import rule from '../rules/consistent-callback-naming';

ruleTesterJsx.run('consistent-callback-naming', rule, {
  valid: [
    // Valid callback props with 'on' prefix and proper function types
    {
      code: `
        type Props = {
          onFoo: (value: string) => void;
          onBar: () => Promise<void>;
          onClick: React.MouseEventHandler;
        };

        const Example = ({ onFoo, onBar, onClick }: Props) => (
          <div onClick={onClick}>
            <button onClick={() => onFoo('test')} />
            <button onClick={() => onBar()} />
          </div>
        );
      `,
    },
    // Non-function props should not require 'on' prefix
    {
      code: `
        type Props = {
          value: string;
          items: string[];
          isEnabled: boolean;
          data: { id: number };
        };

        const Example = (props: Props) => <div {...props} />;
      `,
    },
    // React component props ending with 'Component' should not require 'on' prefix
    {
      code: `
        import { PersonIcon } from '@mui/icons-material';

        type Props = {
          IconComponent: React.ComponentType;
          HeaderComponent: React.FC;
          FooterComponent: React.ComponentType<{ text: string }>;
        };

        const Example = ({ IconComponent, HeaderComponent, FooterComponent }: Props) => (
          <div>
            <GradientIcon
              IconComponent={PersonIcon}
              sx={{ width: '20px', height: '20px' }}
            />
            <HeaderComponent />
            <FooterComponent text="Hello" />
          </div>
        );
      `,
    },
    // React component props NOT ending with 'Component' should not require 'on' prefix
    {
      code: `
        import { PersonIcon } from '@mui/icons-material';

        type Props = {
          Icon: React.ComponentType;
          Header: React.FC;
          Footer: React.ComponentType<{ text: string }>;
        };

        const Example = ({ IconComponent, HeaderComponent, FooterComponent }: Props) => (
          <div>
            <GradientIcon
              IconComponent={PersonIcon}
              sx={{ width: '20px', height: '20px' }}
            />
            <HeaderComponent />
            <FooterComponent text="Hello" />
          </div>
        );
      `,
    },
    // PascalCase props should not require 'on' prefix
    {
      code: `
        type Props = {
          Message: React.ReactNode;
          IconComponent: React.ComponentType;
          CustomElement: JSX.Element;
        };

        const Example = ({ Message, IconComponent, CustomElement }: Props) => (
          <div>
            <StreamThread
              autoFocus
              enableDateSeparator
              Message={Message}
              additionalMessageInputProps={additionalMessageInputProps}
            />
            <GradientIcon
              IconComponent={PersonIcon}
              sx={{ width: '20px', height: '20px' }}
            />
            {CustomElement}
          </div>
        );
      `,
    },
    // Theme props in ThemeProvider should not require 'on' prefix
    {
      code: `
        import { ThemeProvider } from '@mui/material';
        import { defaultTheme } from './theme';

        const App = () => (
          <ThemeProvider theme={defaultTheme}>
            <div>Content</div>
          </ThemeProvider>
        );
      `,
    },
    // Function props with 'on' prefix should be valid
    {
      code: `
        interface CallbackProps {
          onSubmit: (data: FormData) => void;
          onValidate: (value: string) => boolean;
        }

        const Form = ({ onSubmit, onValidate }: CallbackProps) => {
          return <form onSubmit={(e) => onSubmit(new FormData(e.target))} />;
        };
      `,
    },
    // Callback functions without 'handle' prefix
    {
      code: `
        const Component = () => {
          const submitForm = async (data: FormData) => {
            await fetch('/api', { method: 'POST', body: data });
          };

          const validateInput = (value: string): boolean => {
            return value.length > 0;
          };

          return (
            <form onSubmit={(e) => submitForm(new FormData(e.target))}>
              <input onChange={(e) => validateInput(e.target.value)} />
            </form>
          );
        };
      `,
    },
    // Render functions returning JSX should be valid (Bug #1140)
    {
      code: `
        import React, { useCallback } from 'react';

        const TeamHit = ({ hit, isPinned }: { hit: any, isPinned: boolean }) => {
          const renderHit = useCallback((hit: any) => {
            return <div {...hit} isPinned={isPinned} />;
          }, [isPinned]);

          return (
            <VerticalCarousel
              render={renderHit}
            />
          );
        };
      `,
    },
    {
      code: `
        import React from 'react';
        interface Props {
          renderItem: (item: any) => React.ReactNode;
        }
        const List = ({ renderItem }: Props) => (
          <div renderItem={renderItem} />
        );
      `,
    },
    // Callback function returning JSX inside useCallback should be valid
    {
      code: `
        import React, { useCallback } from 'react';
        const Component = () => {
          const getItem = useCallback(() => <div>Item</div>, []);
          return <div item={getItem} />;
        };
      `,
    },
    // Namespaced and generic React element types should be valid
    {
      code: `
        import React from 'react';
        interface Props {
          customRenderer: () => React.ReactElement<{ foo: string }>;
          nodeRenderer: () => React.ReactNode;
        }
        const Example = ({ customRenderer, nodeRenderer }: Props) => (
          <div custom={customRenderer} node={nodeRenderer} />
        );
      `,
    },
    // Bug #1182: prop whose declared type is a union of a function and a
    // non-function (e.g. validator OR array of options). A plain function value
    // is passed, but the prop is a configuration prop, not an event handler.
    {
      code: `
        type Validate = (value?: string) => boolean;
        type ChildProps = {
          options?: Validate | readonly string[];
        };
        const Child = (props: ChildProps) => <div />;
        const isAllowed: Validate = (v) => true;
        const Parent = () => <Child options={isAllowed} />;
      `,
    },
    // Bug #1182: the value itself has a union type (function | array).
    {
      code: `
        type Validate = (value?: string) => boolean;
        const Child = (props: any) => <div />;
        const options: Validate | readonly string[] = (v) => true;
        const Parent = () => <Child options={options} />;
      `,
    },
    // Bug #1182: optional union prop (function | array | undefined). The
    // undefined member is ignored, but the array member still makes it mixed.
    {
      code: `
        type Validate = (value?: string) => boolean;
        type ChildProps = {
          validate?: Validate | readonly number[];
        };
        const Child = (props: ChildProps) => <div />;
        const fn: Validate = (v) => true;
        const Parent = () => <Child validate={fn} />;
      `,
    },
    // Bug #1182: union of a function and a primitive (string).
    {
      code: `
        type ChildProps = {
          format: ((v: string) => string) | string;
        };
        const Child = (props: ChildProps) => <div />;
        const fmt = (v: string) => v;
        const Parent = () => <Child format={fmt} />;
      `,
    },
    // Bug #1182: union mixing a function with multiple non-function members.
    {
      code: `
        type Validate = (value?: string) => boolean;
        type ChildProps = {
          rule: Validate | string | number;
        };
        const Child = (props: ChildProps) => <div />;
        const fn: Validate = (v) => true;
        const Parent = () => <Child rule={fn} />;
      `,
    },
    // Bug #1182: union of a function and a boolean.
    {
      code: `
        type ChildProps = {
          toggle: (() => void) | boolean;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = () => {};
        const Parent = () => <Child toggle={fn} />;
      `,
    },
    // Bug #1262: an accessor / prop-deriver — a pure (non-union) function-typed
    // prop whose return type is a consumed value (a config object) rather than a
    // discarded void. Not an event handler, so the "on" prefix must not be
    // required. Cf. MUI getRowId/valueGetter, Formik validate.
    {
      code: `
        type OverlayProps = {
          elementDeleteOverlayProps?: (index: number) => { readonly sx: object };
        };
        const Overlay = (props: OverlayProps) => {
          return null;
        };
        const deriveHiddenOverlayProps = () => {
          return { sx: { display: 'flex' } } as const;
        };
        const Wrapper = () => {
          return <Overlay elementDeleteOverlayProps={deriveHiddenOverlayProps} />;
        };
      `,
    },
    // Bug #1262: a string-returning accessor (getRowId-style) is consumed by the
    // component, not invoked as an event handler, so it is exempt too.
    {
      code: `
        type ListProps = {
          getRowId?: (row: { id: string }) => string;
        };
        const List = (props: ListProps) => {
          return null;
        };
        const resolveRowId = (row: { id: string }) => {
          return row.id;
        };
        const Wrapper = () => {
          return <List getRowId={resolveRowId} />;
        };
      `,
    },
    // Bug #1262: a getter returning an HTMLElement is an accessor whose return is
    // consumed — neither a React render prop (not JSX/ReactNode) nor an event
    // handler — so it must not require the "on" prefix.
    {
      code: `
        interface Props {
          getElement: () => HTMLElement;
        }
        const Example = ({ getElement }: Props) => (
          <div element={getElement} />
        );
      `,
    },
    // Bug #1301: identifiers where "handle" is followed by a lowercase letter are
    // ordinary words (the past participle "handled", not the "handle" verb
    // prefix). They must NOT be flagged or autofix-stripped (handledFingerprints
    // must never become dFingerprints).
    {
      code: `
        const handledFingerprints = { ...manifest.handledFingerprints };
        for (const handled of commit.handled) {
          handledFingerprints[handled.fingerprint] = handled.issueNumber;
        }
      `,
    },
    // Bug #1301: the noun "handler" / plural "handlers" and other "handle" +
    // lowercase words ("handles", "handling", "handleable", "handledBy") are
    // legitimate identifiers, not the handler-verb prefix.
    {
      code: `
        const handler = (event: Event) => console.log(event);
        const handlers = [handler];
        const handles = { primary: handler };
        const handling = true;
        const handleable = ['a', 'b'];
        const handledBy = 'system';
      `,
    },
    // Bug #1301: a bare "handle" identifier is a whole word, not a prefix.
    {
      code: `
        const handle = getWindowHandle();
        const fileHandle = handle;
      `,
    },
    // Bug #1301: object literal / destructuring properties named with a
    // "handle" + lowercase word must not be flagged.
    {
      code: `
        const config = {
          handled: true,
          handler: () => {},
          handledCount: 0,
        };
      `,
    },
    // Bug #1302: a file parsed without TypeScript project services (a plain
    // Node .mjs script, a config file, anything outside the TS project) provides
    // no `parserServices.program`. The rule must silently no-op on such files —
    // NOT throw at rule-load time, which would abort the entire eslint run for
    // every file in the invocation. Even a name that would normally be flagged
    // (handleClick) produces no report here because the visitor is skipped.
    {
      code: `const handleClick = () => {};`,
      parser: require.resolve('espree'),
      parserOptions: { ecmaVersion: 2020 },
    },
    // Bug #1719: in an ObjectPattern the key names a property of the object
    // being destructured — here Stream Chat's own `handleDelete` member, passed
    // to the hook as a string literal too. It is not a name this file owns, and
    // rewriting it changes WHICH property is read (the fixer produced
    // `const { delete: streamDeleteMessage } = ...`, a read of a member that
    // does not exist). The local binding is already well named, so there is
    // nothing to report at all.
    {
      code: `
        const { handleDelete: streamDeleteMessage } = useMessage('handleDelete');
        export const remove = streamDeleteMessage;
      `,
    },
    // Bug #1719: a shorthand destructuring binding is one token serving as both
    // the foreign property name and the local name. Rewriting it read the wrong
    // property AND stranded every reference to the binding.
    {
      code: `
        const { handleClick } = props;
        export const clicked = handleClick;
      `,
    },
    // Bug #1719: the same shape whose rewrite did not even parse —
    // `const { delete } = useMessage()` is a SyntaxError because `delete` is a
    // reserved word and cannot be a binding name.
    {
      code: `
        const { handleDelete } = useMessage();
        export const remove = handleDelete;
      `,
    },
    // Bug #1719: a destructured function parameter is the same pattern in
    // another position — the key names the caller's property.
    {
      code: `
        export function useSubmit({ handleSubmit: submit }) {
          return submit;
        }
      `,
    },
    // Bug #1719: nested patterns are patterns too.
    {
      code: `
        const {
          actions: { handleOpenThread: openThread },
        } = useMessage('handleOpenThread');
        export const open = openThread;
      `,
    },
    // Bug #1719: a pattern with a rest element and a default keeps the same
    // exemption — the keys still name the source object's properties.
    {
      code: `
        const { handleClick: click = noop, ...rest } = props;
        export const used = [click, rest];
      `,
    },
  ],
  invalid: [
    // Bug #1522: the prop rename spans the JSX usage AND the props type
    // declaration that binds the name (here `ChildProps`, plus every reader of
    // it such as `props.validate`). ESLint fixes a single file and cannot
    // rename the whole contract, so the violation is reported without an
    // autofix — rewriting only the JSX attribute produced TS2322.
    {
      code: `
        type ChildProps = {
          validate: (value: string) => void;
        };
        const Child = (props: ChildProps) => <div>{String(props.validate)}</div>;
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: null,
    },
    // Bug #1522: an `interface` declares the contract exactly as a `type` alias
    // does, and the component destructures the prop — the rename would have to
    // reach the member, the binding and every reference to it.
    {
      code: `
        interface ChildProps {
          validate: (value: string) => void;
        }
        const Child = ({ validate }: ChildProps) => <div>{String(validate)}</div>;
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: null,
    },
    // Bug #1522: an optional member on an in-file interface. The `?` sits
    // between the name token and the type, so a naive rename is doubly unsafe.
    {
      code: `
        interface ChildProps {
          submit?: (value: string) => void;
        }
        const Child = (props: ChildProps) => <div>{String(props.submit)}</div>;
        const fn = (v: string) => {};
        const Parent = () => <Child submit={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: null,
    },
    // Bug #1522: the props type lives in another module. The declaration is
    // outside the fixed file entirely, so renaming the attribute alone would
    // half-rename the contract with no chance of repairing the other end.
    {
      code: `
        import type { ChildProps } from './ChildProps';
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: null,
    },
    // Bug #1522: the component itself is imported — neither its props type nor
    // its other call sites are visible here.
    {
      code: `
        import { Child } from './Child';
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: null,
    },
    // Bug #1522: a component whose props type cannot be resolved syntactically
    // (an inline literal on an untyped local). Nothing identifies where the
    // name is bound, so the rename cannot be completed.
    {
      code: `
        const Child = (props: { validate: (value: string) => void }) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      output: null,
    },
    // Bug #1522: several call sites of the same locally declared component. A
    // fixer renaming the declaration once would have to keep every usage in
    // step; both usages are reported and neither is rewritten.
    {
      code: `
        type ChildProps = {
          validate: (value: string) => void;
        };
        const Child = (props: ChildProps) => <div>{String(props.validate)}</div>;
        const fn = (v: string) => {};
        const First = () => <Child validate={fn} />;
        const Second = () => <Child validate={fn} />;
      `,
      errors: [
        { messageId: 'callbackPropPrefix' },
        { messageId: 'callbackPropPrefix' },
      ],
      output: null,
    },
    // Bug #1182 control: an exclusively-function prop on a typed component must
    // still be flagged — the union exemption must not suppress real callbacks.
    // The signature returns void (a genuine event handler), so the #1262
    // accessor exemption does not apply.
    {
      code: `
        type ChildProps = {
          validate: (value: string) => void;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      // Bug #1522: `ChildProps.validate` binds the prop name, so no autofix.
      output: null,
    },
    // Bug #1182 control: an optional pure callback (function | undefined) is not
    // a mixed union, so it must still be flagged. Void return => event handler,
    // not a #1262 accessor.
    {
      code: `
        type ChildProps = {
          submit?: (value: string) => void;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child submit={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      // Bug #1522: an optional member binds the name just as a required one
      // does, so the rename still spans the declaration — no autofix.
      output: null,
    },
    // Bug #1182 control: a nullable pure callback (function | null) is not a
    // mixed union once null is filtered, so it must still be flagged.
    {
      code: `
        type ChildProps = {
          submit: (() => void) | null;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = () => {};
        const Parent = () => <Child submit={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      // Bug #1522: reported, not fixed.
      output: null,
    },
    // Bug #1182 control: a union whose members are all functions has no
    // non-function member, so it must still be flagged. Every member returns
    // void => event handler, so the #1262 accessor exemption does not apply.
    {
      code: `
        type ChildProps = {
          validate: ((v: string) => void) | ((v: number) => void);
        };
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child validate={fn} />;
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      // Bug #1522: reported, not fixed.
      output: null,
    },
    // Function prop without 'on' prefix. The flagged prop returns void (a
    // genuine handler); the #1262 accessor exemption applies only to
    // value-returning function props.
    {
      code: `
        interface Props {
          submitForm: (data: FormData) => Promise<void>;
          validateInput: (value: string) => void;
        }

        const Form = ({ submitForm, validateInput }: Props) => (
          <form>
            <input validateInput={validateInput} />
            <button onClick={() => submitForm(new FormData())}>Submit</button>
          </form>
        );
      `,
      errors: [{ messageId: 'callbackPropPrefix' }],
      // Bug #1522: a host element's props are bound by `JSX.IntrinsicElements`
      // (which a project can augment, e.g. react-three-fiber), so a host
      // attribute is no safer to rewrite than a component's — no autofix.
      output: null,
    },
    // Function with 'handle' prefix
    {
      code: `
        const Component = () => {
          const handleSubmit = async (data: FormData): Promise<void> => {
            await fetch('/api', { method: 'POST', body: data });
          };

          return (
            <form onSubmit={(e) => handleSubmit(new FormData(e.target))} />
          );
        };
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const Component = () => {
          const submit = async (data: FormData): Promise<void> => {
            await fetch('/api', { method: 'POST', body: data });
          };

          return (
            <form onSubmit={(e) => submit(new FormData(e.target))} />
          );
        };
      `,
    },
    // Object method with 'handle' prefix
    {
      code: `
        class FormHandler {
          handleSubmit(data: FormData): Promise<Response> {
            return fetch('/api', { method: 'POST', body: data });
          }

          handleValidate(value: string): boolean {
            return value.length > 0;
          }
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: `
        class FormHandler {
          submit(data: FormData): Promise<Response> {
            return fetch('/api', { method: 'POST', body: data });
          }

          validate(value: string): boolean {
            return value.length > 0;
          }
        }
      `,
    },
    // Multiple issues in one component. The "handle" functions are still
    // renamed, but the "validateInput" prop is exempt: its value returns a
    // boolean (a consumed value), making it a #1262 accessor rather than an
    // event handler, so it keeps its name.
    {
      code: `
        interface Props {
          submitForm: (data: FormData) => Promise<void>;
          validateInput: (value: string) => boolean;
        }

        const Form = ({ submitForm, validateInput }: Props) => {
          const handleFormSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            await submitForm(new FormData(e.target as HTMLFormElement));
          };

          const handleValidation = (value: string): boolean => {
            return validateInput(value);
          };

          return (
            <form onSubmit={handleFormSubmit}>
              <input validateInput={handleValidation} />
            </form>
          );
        };
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: `
        interface Props {
          submitForm: (data: FormData) => Promise<void>;
          validateInput: (value: string) => boolean;
        }

        const Form = ({ submitForm, validateInput }: Props) => {
          const formSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            await submitForm(new FormData(e.target as HTMLFormElement));
          };

          const handleValidation = (value: string): boolean => {
            return validateInput(value);
          };

          return (
            <form onSubmit={formSubmit}>
              <input validateInput={handleValidation} />
            </form>
          );
        };
      `,
    },
    // Class with getter and handler/handlers
    {
      code: `
        class EventManager {
          private readonly handler: (event: Event) => void;
          private readonly handlers: ((event: Event) => void)[];

          constructor() {
            this.handler = (event) => console.log(event);
            this.handlers = [];
          }

          get handleEvents() {
            return this.handlers;
          }

          handleEvent(event: Event) {
            this.handler(event);
          }
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      // No autofix should be applied for handler/handlers or getter
      output: `
        class EventManager {
          private readonly handler: (event: Event) => void;
          private readonly handlers: ((event: Event) => void)[];

          constructor() {
            this.handler = (event) => console.log(event);
            this.handlers = [];
          }

          get handleEvents() {
            return this.handlers;
          }

          event(event: Event) {
            this.handler(event);
          }
        }
      `,
    },
    // Bug #1301 disambiguation: a genuine "handle" + capitalized handler is still
    // flagged and autofixed even when a past-participle word ("handled") that
    // must be left untouched sits right beside it in the same scope.
    {
      code: `
        const Component = () => {
          const handled = new Set();
          const handleClick = (id: string): void => {
            handled.add(id);
          };
          return <button onClick={() => handleClick('x')} />;
        };
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const Component = () => {
          const handled = new Set();
          const click = (id: string): void => {
            handled.add(id);
          };
          return <button onClick={() => click('x')} />;
        };
      `,
    },
    // Bug #1301 boundary: "handleUpdate" (handle + capital U) is the prefix
    // pattern, so it is flagged; the neighbouring "handledCount" data variable is
    // not.
    {
      code: `
        const handledCount = 0;
        const handleUpdate = (): void => {};
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const handledCount = 0;
        const update = (): void => {};
      `,
    },
    // An exported binding is a cross-file contract: the violation still reports,
    // but the rename is withheld because a single-file fixer cannot rewrite the
    // importers, and `export const click` strands every `import { handleClick }`
    // with TS2724.
    {
      code: `export const handleClick = () => {};`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    {
      code: `export function handleUpdate(): void {}`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    {
      code: `export default function handleSubmit(): void {}`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Exported through a separate specifier rather than an inline modifier —
    // the binding still leaves the module, so the rename is still withheld.
    {
      code: `
        const handleClick = () => {};
        export { handleClick };
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Renamed on the way out: the local name is still the one importers bind to
    // via the specifier, so rewriting it breaks `export { click as onClick }`.
    {
      code: `
        const handleClick = () => {};
        export { handleClick as onClick };
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // A module-local binding that merely SHARES a name with an exported one is
    // still fixable — the carve-out keys off the binding, not the spelling.
    {
      code: `
        export const handleClick = () => {};
        function inner() {
          const handleUpdate = () => {};
          return handleUpdate;
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: `
        export const handleClick = () => {};
        function inner() {
          const update = () => {};
          return update;
        }
      `,
    },
    // Class with parameters and references
    {
      code: `
        class Component {
          constructor(
            private readonly handleClick: () => void,
            private readonly handleChange: (value: string) => void,
          ) {}

          onClick() {
            this.handleClick();
          }

          onChange(value: string) {
            this.handleChange(value);
          }
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      // No autofix should be applied for class parameters
      output: `
        class Component {
          constructor(
            private readonly handleClick: () => void,
            private readonly handleChange: (value: string) => void,
          ) {}

          onClick() {
            this.handleClick();
          }

          onChange(value: string) {
            this.handleChange(value);
          }
        }
      `,
    },
    // Bug #1719 control: the narrowing must not become a silent disable. A real
    // class method is the case the rule exists for, and it still reports and
    // still auto-fixes.
    {
      code: `class C { handleClick() {} }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { click() {} }`,
    },
    // Bug #1719 control: an ordinary object literal — neither exported nor
    // returned, so its members have no reader outside this file — keeps its
    // autofix.
    {
      code: `const config = { handleClick: onClick };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `const config = { click: onClick };`,
    },
    // Bug #1719 control: an object literal method in a local object is fixed the
    // same way its property-valued sibling is.
    {
      code: `const config = { handleClick() {} };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `const config = { click() {} };`,
    },
    // Bug #1719: stripping the prefix lands on `delete`, a reserved word.
    // `class C { delete() {} }` happens to parse, but the rule cannot see
    // whether the member is later destructured into a binding (where it does
    // not), so it declines uniformly rather than emitting a keyword.
    {
      code: `class C { handleDelete() {} }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: `handleNew` -> `new` is the same hazard.
    {
      code: `class C { handleNew() {} }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: `handleReturn` -> `return`, in an object literal this time.
    {
      code: `const config = { handleReturn: onReturn };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: the reserved-word hazard is worse on a variable, where the
    // emitted name is a binding: `const delete = () => {}` does not parse.
    {
      code: `
        const handleDelete = () => {};
        export const remove = handleDelete;
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: `handleTypeof` -> `typeof` on a function declaration.
    {
      code: `function handleTypeof() {}`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: a shorthand property in an object literal is a single token
    // that is both the member name and a reference to a binding. Rewriting it
    // renamed the member and re-pointed it at a name that need not exist, so the
    // violation is reported without a fix.
    {
      code: `const api = { handleClick };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: an exported object literal is an API surface whose readers live
    // in files a single-file fixer cannot edit. Reported, not rewritten — the
    // fixer used to silently rename the member to `openThread`.
    {
      code: `export const api = { handleOpenThread: openThread };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: an object literal returned from a hook is read by its callers
    // (usually by destructuring), so its member names are equally out of reach.
    {
      code: `
        export function useThread() {
          return { handleOpenThread: openThread };
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: when a destructuring pattern binds a prefixed key to a local
    // name that ALSO carries the prefix, the local name is the file's own and is
    // what the report targets — the key stays untouched and every reference to
    // the binding moves with the declaration. The report is relocated, not
    // dropped: the guard narrows what is rewritten, not what is caught.
    {
      code: `
        const { handleClose: handleCloseModal } = props;
        console.log(handleCloseModal);
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const { handleClose: closeModal } = props;
        console.log(closeModal);
      `,
    },
    // Bug #1719: the same relocation, with a rename that would emit a reserved
    // word — reported, not rewritten.
    {
      code: `
        const { handleClose: handleDelete } = props;
        console.log(handleDelete);
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: an exported binding is read by importers the fixer cannot
    // reach, so the rename is withheld.
    {
      code: `export const { handleClose: handleCloseModal } = props;`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: the rename would collide with a binding already visible here,
    // silently re-pointing the references at the other declaration.
    {
      code: `
        const closeModal = () => {};
        const { handleClose: handleCloseModal } = props;
        console.log(closeModal, handleCloseModal);
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: withholding the destructuring-key rewrite would otherwise let
    // the object-literal half of the same rename move on its own, leaving the
    // pattern reading a member that no longer exists. A member the file reads by
    // name is not renamed.
    {
      code: `
        const handlers = { handleClick: onClick };
        const { handleClick } = handlers;
        console.log(handleClick);
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: the same guard covers a member read through a property access.
    {
      code: `
        const handlers = { handleClick: onClick };
        handlers.handleClick();
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: a computed read by string literal is a read too.
    {
      code: `
        const handlers = { handleClick: onClick };
        handlers['handleClick']();
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: the rename would produce two members with the same name, and
    // the later one silently wins.
    {
      code: `const handlers = { click: onClick, handleClick: onClick };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1719: the same collision on a class body is a duplicate method.
    {
      code: `class C { click() {} handleClick() {} }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
  ],
});

/**
 * Bug #1719 whole-file check. A `RuleTester` case compares `output` to an
 * expected string, which pins the text but never asks whether that text is a
 * program. The defect this suite guards against produced output that does not
 * parse at all (`const { delete } = useMessage()`), so the fixer is run over a
 * whole file and its result fed back to the parser.
 */
describe('consistent-callback-naming --fix output parses (Bug #1719)', () => {
  const RULE_ID = 'test/consistent-callback-naming';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const tsParser = require('@typescript-eslint/parser');
  const PARSER_OPTIONS = {
    ecmaVersion: 2020 as const,
    sourceType: 'module' as const,
    ecmaFeatures: { jsx: true },
  };

  const fix = (code: string) => {
    const linter = new Linter();
    linter.defineParser('@typescript-eslint/parser', tsParser);
    linter.defineRule(RULE_ID, rule as unknown as Rule.RuleModule);
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: PARSER_OPTIONS,
        rules: { [RULE_ID]: 'error' },
      },
      'useDeleteMessage.dynamic.tsx',
    ).output;
  };

  const parses = (code: string) => {
    try {
      // `range`/`loc` are required: without them the standalone parser throws on
      // valid input too, which would make every assertion below vacuous.
      tsParser.parse(code, { ...PARSER_OPTIONS, range: true, loc: true });
      return true;
    } catch {
      return false;
    }
  };

  it('rejects the output the fixer used to produce (control)', () => {
    // Without this control the parse assertions could pass on a parser that
    // never throws.
    expect(parses('const { delete } = useMessage();')).toBe(false);
    expect(parses('const delete = () => {};')).toBe(false);
    expect(parses('const { handleDelete } = useMessage();')).toBe(true);
  });

  it('leaves a shorthand destructuring binding alone and parseable', () => {
    const code = [
      `const { handleDelete } = useMessage();`,
      `export const remove = handleDelete;`,
      ``,
    ].join('\n');

    const output = fix(code);

    expect(output).toBe(code);
    expect(parses(output)).toBe(true);
  });

  it('leaves a renamed destructuring key alone and parseable', () => {
    const code = [
      `const { handleDelete: streamDeleteMessage } = useMessage('handleDelete');`,
      `export const remove = streamDeleteMessage;`,
      ``,
    ].join('\n');

    const output = fix(code);

    expect(output).toBe(code);
    expect(parses(output)).toBe(true);
  });

  it('never emits a reserved word for a variable rename', () => {
    const code = `const handleDelete = () => {};\nexport const remove = handleDelete;\n`;

    const output = fix(code);

    expect(output).toBe(code);
    expect(parses(output)).toBe(true);
  });

  it('still renames a class method end to end', () => {
    const output = fix(`class C {\n  handleClick() {}\n}\n`);

    expect(output).toBe(`class C {\n  click() {}\n}\n`);
    expect(parses(output)).toBe(true);
  });
});
