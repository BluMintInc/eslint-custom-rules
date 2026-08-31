import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
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
    // Bug #1944 control: the rule keys on the `handle` prefix, not on the
    // abstract/implements spelling. An `on`-prefixed contract is silent at BOTH
    // ends — the declaration this rule newly visits and the implementation whose
    // fix it now withholds — so neither addition reports on a compliant name.
    {
      code: `
        abstract class BaseForm {
          abstract onSubmit(data: string): string;
        }
        export class SubmitForm extends BaseForm {
          onSubmit(data: string): string {
            return data;
          }
        }
      `,
    },
    {
      code: `
        interface Submittable {
          onSubmit(data: string): string;
        }
        export class SubmitForm implements Submittable {
          onSubmit(data: string): string {
            return data;
          }
        }
      `,
    },
    // Bug #1944: a member of an `interface`/type literal is a PROP declaration,
    // which this rule governs through `callbackPropPrefix` — whose remedy is the
    // opposite one (`onSubmit`, not `submit`). Reporting `callbackFunctionPrefix`
    // on the same declaration would hand the author contradictory instructions,
    // so type members are deliberately not a subject of the implementation half.
    {
      code: `
        export interface FormContract {
          handleSubmit(data: string): string;
        }
      `,
    },
    {
      code: `
        export type FormContract = {
          handleSubmit: (data: string) => string;
        };
      `,
    },
    // Bug #1949 control: the class-field arm keys on the `handle` prefix, not on
    // the field spelling. A compliant field name stays silent.
    {
      code: `class C { onClick = () => {}; }`,
    },
    // Bug #1949: the #1301 disambiguation reaches the field arm too. "handle"
    // followed by a lowercase letter is an ordinary word, not the prefix, and a
    // bare `handle` is a whole word — none of these is a subject however it is
    // spelled.
    {
      code: `
        class C {
          handled = true;
          handler = (): void => {};
          handlers: (() => void)[] = [];
          handledCount = 0;
          handle = (): void => {};
        }
      `,
    },
    // Bug #1949: a computed key is an expression, so the name the class member
    // actually gets is whatever the binding holds. The field contributes no
    // report of its own — see the invalid case that pins the binding's report
    // as the only one.
    {
      code: `
        import { key } from './keys';
        class C {
          [key] = (): void => {};
        }
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
    // Bug #1944: renaming the implementation of an abstract member on its own
    // leaves the declaration behind and the subclass stops satisfying it —
    // measured `TS2515: Non-abstract class 'SubmitForm' does not implement
    // inherited abstract member 'handleSubmit'` on input that compiled clean.
    // Both ends are reported (the declaration by the abstract-member visitor,
    // the implementation as before) and NEITHER is rewritten, so the author
    // renames both deliberately. `output: null` is the assertion that matters:
    // an omitted `output` would assert nothing about the fixer.
    {
      code: `
        abstract class BaseForm {
          abstract handleSubmit(data: string): string;
        }
        export class SubmitForm extends BaseForm {
          handleSubmit(data: string): string {
            return data;
          }
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: null,
    },
    // Bug #1944: the `implements` half of the same contract — measured
    // `TS2420: Class 'SubmitForm' incorrectly implements interface
    // 'Submittable'`. The interface member itself is not a subject (its remedy
    // belongs to the prop half of this rule), so only the implementation
    // reports — with the rename withheld.
    {
      code: `
        interface Submittable {
          handleSubmit(data: string): string;
        }
        export class SubmitForm implements Submittable {
          handleSubmit(data: string): string {
            return data;
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1944: a type literal declares the same contract and breaks the same
    // way (TS2420).
    {
      code: `
        type Submittable = {
          handleSubmit(data: string): string;
        };
        export class SubmitForm implements Submittable {
          handleSubmit(data: string): string {
            return data;
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1944 fourth shape: an abstract PROPERTY is a "class property" in the
    // docs' own subject list, so it is a subject like any other member and
    // silence on it is a gap. Report-only: every implementor of the declaration
    // must move with it, and implementors live in other files.
    {
      code: `
        export abstract class BaseForm {
          abstract handleSubmit: (data: string) => string;
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    {
      code: `
        export abstract class BaseForm {
          abstract handleSubmit(data: string): string;
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1944: the heritage clause alone withholds the rename, because the
    // base is routinely imported and the declaration need not be in this file.
    // The cost of that conservatism is exactly this case — a member that may
    // override nothing keeps its report but loses its autofix.
    {
      code: `
        import { Base } from './base';
        export class Widget extends Base {
          handleClick() {}
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1944 regression guard: the withholding must not become a blanket
    // disable of the fixer. A class with NO heritage cannot be satisfying any
    // declaration, so its `handle` member is still reported AND still renamed.
    // The class is module-private because an exported one is withheld for a
    // different reason (Bug #1946), which would make this guard vacuous.
    {
      code: `
        class SubmitForm {
          handleSubmit(data: string): string {
            return data;
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class SubmitForm {
          submit(data: string): string {
            return data;
          }
        }
      `,
    },
    // Bug #1946: the repro. The rename reached the declaration and left
    // `this.handleClick()` behind, turning a file that compiled into
    // `TS2339: Property 'handleClick' does not exist on type 'C'`. The class is
    // exported, so its public members are named by files this fixer cannot
    // edit and the rename is withheld outright — the report stands.
    {
      code: `
        export class C {
          handleClick(): void {}
          run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: an exported class's public member is withheld even with no
    // reference in this file at all — the readers that make the rename unsafe
    // are the ones in other modules.
    {
      code: `
        export class SubmitForm {
          handleSubmit(data: string): string {
            return data;
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: a `private` member cannot be named outside the class body, so
    // every reference to it is in this file and the rename owns them all — even
    // when the class itself is exported. The declaration and the `this.` read
    // move together, in one fix.
    {
      code: `
        export class C {
          private handleClick(): void {}
          run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        export class C {
          private click(): void {}
          run(): void {
            this.click();
          }
        }
      `,
    },
    // Bug #1946: an optional-chained read is the same reference and moves with
    // the declaration.
    {
      code: `
        class C {
          handleClick(): void {}
          run(): void {
            this?.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click(): void {}
          run(): void {
            this?.click();
          }
        }
      `,
    },
    // Bug #1946: a read from a nested arrow in another method still resolves to
    // the class instance — the arrow inherits `this` lexically — so it is
    // rewritten by the same fix.
    {
      code: `
        class C {
          handleClick(): void {}
          run(items: number[]): void {
            items.forEach(() => {
              this.handleClick();
            });
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click(): void {}
          run(items: number[]): void {
            items.forEach(() => {
              this.click();
            });
          }
        }
      `,
    },
    // Bug #1946: a field initializer's arrow is the same lexical `this`.
    {
      code: `
        class C {
          handleClick(): void {}
          run = (): void => {
            this.handleClick();
          };
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click(): void {}
          run = (): void => {
            this.click();
          };
        }
      `,
    },
    // Bug #1946: `this` in a static member is the class object, so a static
    // member and its static reads move together.
    {
      code: `
        class C {
          static handleClick(): void {}
          static run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          static click(): void {}
          static run(): void {
            this.click();
          }
        }
      `,
    },
    // Bug #1946: a computed read spells the member as a string the fixer must
    // not rewrite blindly, so the whole rename is withheld rather than applied
    // in part — a partial rename is precisely the breakage being prevented.
    {
      code: `
        class C {
          handleClick(): void {}
          run(): void {
            this['handleClick']();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: `this[key]` does not even name which member is read.
    {
      code: `
        class C {
          handleClick(): void {}
          run(key: 'handleClick'): void {
            this[key]();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: an ordinary function expression rebinds `this` to its caller,
    // so `this.handleClick` inside one may be some other object's member.
    {
      code: `
        class C {
          handleClick(): void {}
          run(items: number[]): void {
            items.forEach(function (this: C) {
              this.handleClick();
            }, this);
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: destructuring off `this` binds the member by name in a form no
    // key rewrite follows.
    {
      code: `
        class C {
          handleClick(): void {}
          run(): void {
            const { handleClick } = this;
            handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: a read through an instance rather than through `this` is a
    // reference the fixer cannot attribute to this class.
    {
      code: `
        class C {
          handleClick(): void {}
        }
        const c = new C();
        c.handleClick();
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: a subclass in this file reads the member through `super`, and
    // subclasses in other files can do the same.
    {
      code: `
        class C {
          handleClick(): void {}
        }
        class D extends C {
          run(): void {
            super.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: naming the class at all can hand an instance to another
    // module — `export const c = new C()` exports no class yet exports the
    // member — so any mention beyond the declaration withholds the rename.
    {
      code: `
        class C {
          handleClick(): void {}
          run(): void {
            this.handleClick();
          }
        }
        export const c = new C();
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946: a `get`/`set` pair declares the name twice. The getter is
    // report-only, so renaming the setter alone would split the accessor and
    // leave the assignment form of the property without a setter.
    {
      code: `
        export class C {
          private size = 0;
          private get handleWidth(): number {
            return this.size;
          }
          private set handleWidth(next: number) {
            this.size = next;
          }
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: null,
    },
    // Bug #1946 regression guard for #1944: a heritage class is still reported
    // and still never rewritten, whatever the reference scan finds.
    {
      code: `
        interface Submittable {
          handleSubmit(data: string): string;
        }
        class SubmitForm implements Submittable {
          handleSubmit(data: string): string {
            return this.handleSubmit(data);
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946 regression guard for #1944: an abstract declaration still
    // reports, and still without a fix.
    {
      code: `
        abstract class BaseForm {
          abstract handleSubmit(data: string): string;
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1946 regression guard: the class-member reference scan must not
    // reach the object-literal and function paths, which still autofix — the
    // function rename still moving its reference with it.
    {
      code: `
        const config = { handleClick: onClick };
        const handleSubmit = (): void => {};
        handleSubmit();
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: `
        const config = { click: onClick };
        const submit = (): void => {};
        submit();
      `,
    },
    // Bug #1948: the repro. `submit` is bound between the call and the
    // declaration, so emitting it at the call re-points the call at the local
    // number — `TS2349: This expression is not callable` on input that compiled
    // clean. Nothing else notices: the module scope still holds exactly one
    // `submit`, so a redeclaration check passes.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          const submit = 1;
          handleSubmit();
          console.log(submit);
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: the arrow-variable spelling of the declaration captures
    // identically — the hazard is the reference site, not the declaration form.
    {
      code: `
        const handleSubmit = (): void => {};
        export function run(): void {
          const submit = 1;
          handleSubmit();
          console.log(submit);
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: a `let` binds the name exactly as a `const` does.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          let submit = 1;
          submit += 1;
          handleSubmit();
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: a parameter binds the new name in the scope the reference
    // sits in, with no statement in the body to see it at.
    {
      code: `
        function handleSubmit(): void {}
        export function run(submit: number): void {
          handleSubmit();
          console.log(submit);
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: an inner function declaration of the new name. The capture is
    // callable here, so the file still has no type error until the arity
    // mismatch bites (`TS2554`).
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          function submit(value: number): number {
            return value;
          }
          handleSubmit();
          console.log(submit(1));
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: a `catch` parameter binds the new name in the catch scope,
    // which is the scope the reference resolves through.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          try {
            void 0;
          } catch (submit) {
            handleSubmit();
            console.log(submit);
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: an import binds the new name in module scope, above the
    // declaration rather than below it — the rename would collide there too.
    {
      code: `
        import { submit } from './helpers';
        function handleSubmit(): void {}
        export function run(): void {
          handleSubmit();
          console.log(submit(1));
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: a class declaration binds a value name just as a `const` does.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          class submit {}
          handleSubmit();
          void new submit();
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: an enum is a value binding too.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          enum submit {
            A,
          }
          handleSubmit();
          console.log(submit.A);
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948: the binding need not be one scope away. A reference nested
    // three scopes below the intervening binding is captured just the same, so
    // the walk runs the whole span rather than checking a single level.
    {
      code: `
        function handleSubmit(): void {}
        export function run(items: number[]): void {
          const submit = 1;
          items.forEach(() => {
            if (submit) {
              handleSubmit();
            }
          });
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948 reverse hazard: the new name is free at the reference and taken
    // at the DECLARATION, where the rename would be an outright redeclaration
    // (`TS2300`).
    {
      code: `
        const submit = 1;
        function handleSubmit(): void {}
        export function run(): void {
          handleSubmit();
          console.log(submit);
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948 boundary, and the reason the check is per-REFERENCE: a binding
    // in a sibling block that encloses no reference captures nothing, so the
    // rename still applies. A declaration-site-only check would withhold here
    // and quietly turn the fix off for a whole class of correct renames.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          {
            const submit = 1;
            console.log(submit);
          }
          handleSubmit();
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        function submit(): void {}
        export function run(): void {
          {
            const submit = 1;
            console.log(submit);
          }
          submit();
        }
      `,
    },
    // Bug #1948 control: nothing binds the new name anywhere, so the plain
    // rename still moves the declaration and its reference together.
    {
      code: `
        function handleSubmit(): void {}
        export function run(): void {
          handleSubmit();
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        function submit(): void {}
        export function run(): void {
          submit();
        }
      `,
    },
    /**
     * Bug #1948: the fixture that drives `src/tests/fixer-shadow-capture.test.ts`
     * on this rule. That guard injects a binding of the emitted name into the
     * function body enclosing each report site, so it only reaches this rule
     * through a report whose OWN body carries a reference — a recursive call.
     * Without such a case the guard listed this rule as "emits no new reference
     * to a module-scope-bound name", a reason that was measured true only
     * because no fixture posed the question.
     */
    {
      code: `
        function handleRetry(count: number): void {
          if (count > 0) {
            handleRetry(count - 1);
          }
        }
        console.log(handleRetry);
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        function retry(count: number): void {
          if (count > 0) {
            retry(count - 1);
          }
        }
        console.log(retry);
      `,
    },
    // Bug #1948 regression guard for #1944: a member of a class with heritage
    // is still reported and still never rewritten.
    {
      code: `
        interface Submittable {
          handleSubmit(data: string): string;
        }
        class SubmitForm implements Submittable {
          handleSubmit(data: string): string {
            return data;
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1948 regression guard for #1944: an abstract declaration still
    // reports, report-only.
    {
      code: `
        abstract class BaseForm {
          abstract handleSubmit(data: string): string;
          abstract handleReset: () => void;
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: null,
    },
    // Bug #1948 regression guard for #1946: a class member the file owns is
    // still renamed at the declaration AND at its `this.` reader, in one fix.
    {
      code: `
        class C {
          handleClick(): void {}
          run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click(): void {}
          run(): void {
            this.click();
          }
        }
      `,
    },
    // Bug #1948 regression guard: a plain object-literal member is on neither
    // path this fix touches, and is still reported and still autofixed.
    {
      code: `const config = { handleClick: onClick };`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `const config = { click: onClick };`,
    },
    // Bug #1949: the repro. A callback written as a class FIELD was silent
    // while the same callback written as a METHOD reported, so `=` was a
    // one-token evasion of the rule.
    {
      code: `class C { handleClick = () => {}; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { click = () => {}; }`,
    },
    // Bug #1949: a type annotation on the field changes nothing.
    {
      code: `class C { handleClick: () => void = () => {}; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { click: () => void = () => {}; }`,
    },
    // Bug #1949: a `function` expression is the same field.
    {
      code: `class C { handleClick = function () {}; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { click = function () {}; }`,
    },
    /**
     * Bug #1949 scope decision, pinned in both directions: a field is judged on
     * its NAME, not on whether it holds a function. `handleClickCount = 0`
     * carries the prefix the rule exists to remove, and `const handleClickCount
     * = 0` is already reported one arm over, so a value gate here would make
     * the same name reportable or not depending on which side of an `=` it sat
     * — and would hand back the evasion this fixture's neighbours close, since
     * `handleClick = makeHandler()` is a callback the rule cannot always type.
     */
    {
      code: `class C { handleClickCount = 0; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { clickCount = 0; }`,
    },
    // Bug #1949: an optional field and a definite-assignment field are fields.
    {
      code: `class C { handleClick?: () => void; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { click?: () => void; }`,
    },
    {
      code: `class C { handleClick!: () => void; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { click!: () => void; }`,
    },
    // Bug #1949: `readonly` changes nothing about who can name the member.
    {
      code: `class C { readonly handleClick = (): void => {}; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `class C { readonly click = (): void => {}; }`,
    },
    // Bug #1949: a decorated field is still a field. The decorator sees the
    // renamed key, exactly as it does on the method spelling.
    {
      code: `
        class C {
          @observable handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          @observable click = (): void => {};
        }
      `,
    },
    // Bug #1949: the field's readers are `this.` reads in this file, so the
    // declaration and every one of them move in ONE fix — the #1946 contract,
    // now reached from a field.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click = (): void => {};
          run(): void {
            this.click();
          }
        }
      `,
    },
    // Bug #1949: a field initializer's arrow inherits `this` lexically, so a
    // read from a SIBLING field moves with the declaration too.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run = (): void => {
            this.handleClick();
          };
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click = (): void => {};
          run = (): void => {
            this.click();
          };
        }
      `,
    },
    // Bug #1949: the field's own initializer reading the field back is the
    // same lexical `this`, so the recursive read is rewritten as well.
    {
      code: `
        class C {
          handleClick = (): void => {
            this.handleClick();
          };
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click = (): void => {
            this.click();
          };
        }
      `,
    },
    // Bug #1949: an optional-chained read and a read from a nested arrow are
    // the same reference on a field as on a method.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run(items: number[]): void {
            this?.handleClick();
            items.forEach(() => {
              this.handleClick();
            });
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          click = (): void => {};
          run(items: number[]): void {
            this?.click();
            items.forEach(() => {
              this.click();
            });
          }
        }
      `,
    },
    // Bug #1949: `this` in a static member is the class object, so a static
    // field and its static reads move together.
    {
      code: `
        class C {
          static handleClick = (): void => {};
          static run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        class C {
          static click = (): void => {};
          static run(): void {
            this.click();
          }
        }
      `,
    },
    // Bug #1949: an instance `this.` read cannot be a read of a STATIC field,
    // so the receiver mismatch withholds the whole rename rather than
    // rewriting a member the fixer has not accounted for.
    {
      code: `
        class C {
          static handleClick = (): void => {};
          run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: the mismatch holds in the other direction too — `this` in a
    // static method is the class object, which has no instance field.
    {
      code: `
        class C {
          handleClick = (): void => {};
          static run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a `private` field is unnameable outside the class body, so
    // its rename is owned even when the class is exported (#1946's private
    // arm, reached from a field).
    {
      code: `
        export class C {
          private handleClick = (): void => {};
          run(): void {
            this.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        export class C {
          private click = (): void => {};
          run(): void {
            this.click();
          }
        }
      `,
    },
    // Bug #1949: a `public` field of an exported class is named by importers
    // this fixer cannot edit — `import { C } from './c'; c.handleClick()`
    // fails with TS2339 — so the report stands and the rename is withheld.
    {
      code: `
        export class C {
          public handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: the same for an implicit-public field.
    {
      code: `
        export class C {
          handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: `protected` is nameable by subclasses, which live in files a
    // single-file fixer cannot see, so it is withheld exactly as `public` is.
    {
      code: `
        export class C {
          protected handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a class merely MENTIONED beyond its declaration can hand an
    // instance to another module, so a field of it is withheld too.
    {
      code: `
        class C {
          handleClick = (): void => {};
        }
        export const c = new C();
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949 boundary: a class expression assigned to a module-private
    // binding stays inside the file, so its field IS renamed. Without this the
    // withholding above could be a blanket disable of the field fixer.
    {
      code: `
        const C = class {
          handleClick = (): void => {};
        };
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const C = class {
          click = (): void => {};
        };
      `,
    },
    // Bug #1949 / #1944: a field of a class with `extends` may be satisfying a
    // declaration in a base this file never sees, so the rename is withheld
    // and the report kept.
    {
      code: `
        import { Base } from './base';
        class C extends Base {
          handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949 / #1944: the `implements` half of the same contract. Renaming
    // the field alone leaves the interface member behind — `TS2420: Class 'C'
    // incorrectly implements interface 'Clickable'`.
    {
      code: `
        interface Clickable {
          handleClick: () => void;
        }
        class C implements Clickable {
          handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949 / #1944: `override` says outright that a base declares the
    // member, and the heritage clause it needs already withholds.
    {
      code: `
        import { Base } from './base';
        class C extends Base {
          override handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a `declare` field defines nothing — it asserts that a base
    // constructor, a decorator or a framework establishes the property by name
    // somewhere the class body does not show. That definition is out of the
    // fixer's reach, so the report is kept and the rename withheld, the same
    // answer an abstract declaration gets.
    {
      code: `class C { declare handleClick: () => void; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a computed read spells the member as a string the fixer must
    // not rewrite blindly, so the whole field rename is withheld.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run(): void {
            this['handleClick']();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: `this[key]` does not name which member is read at all.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run(key: 'handleClick'): void {
            this[key]();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: an ordinary function expression rebinds `this` to its caller,
    // so `this.handleClick` inside one may be another object's member.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run(items: number[]): void {
            items.forEach(function (this: C) {
              this.handleClick();
            }, this);
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: destructuring off `this` names the member in a form no key
    // rewrite follows.
    {
      code: `
        class C {
          handleClick = (): void => {};
          run(): void {
            const { handleClick } = this;
            handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a read through an instance is a reference the fixer cannot
    // attribute to this class — including the assignment form, which a field
    // invites more than a method does.
    {
      code: `
        class C {
          handleClick = (): void => {};
        }
        const c = new C();
        c.handleClick = (): void => {};
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a subclass reading the field through `super`.
    {
      code: `
        class C {
          handleClick = (): void => {};
        }
        class D extends C {
          run(): void {
            super.handleClick();
          }
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: any string spelling of the name in the file withholds, since
    // the fixer must not rewrite text it cannot prove names this member.
    {
      code: `
        class C {
          handleClick = (): void => {};
        }
        console.log('handleClick');
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: a sibling already holding the target name would make the
    // rename a duplicate member, silently discarding one of them.
    {
      code: `
        class C {
          click = (): void => {};
          handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: the sibling collision holds across the field/method spellings
    // too — the class body declares one member space per name for this check.
    {
      code: `
        class C {
          click(): void {}
          handleClick = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949: `handleDelete` strips to `delete`, a reserved word. The
    // report is kept and the fix withheld rather than emitting a keyword —
    // the member position happens to parse, but the rule cannot see whether
    // the field is later destructured into a binding, where it does not.
    {
      code: `class C { handleDelete = (): void => {}; }`,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    /**
     * Bug #1949: the `declaresNameTwice` interaction. A static field and an
     * instance method may share a name legally, so the class body declares
     * `handleClick` twice and BOTH reports lose their fix — renaming one half
     * without the other is a rename this pass cannot reason about, and the
     * check is deliberately name-keyed rather than member-space-keyed.
     */
    {
      code: `
        class C {
          static handleClick = (): void => {};
          handleClick(): void {}
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: null,
    },
    /**
     * Bug #1949: a computed key REFERENCES a binding, so the member's own name
     * is whatever that binding holds — something the rule cannot read. The
     * binding's declaration is the subject and carries the only report here;
     * the field contributes none, which is exactly what this case's single
     * expected error pins. The rename that does apply is the binding's.
     */
    {
      code: `
        const handleClick = 'x';
        class C {
          [handleClick] = (): void => {};
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: `
        const click = 'x';
        class C {
          [click] = (): void => {};
        }
      `,
    },
    // Bug #1949 regression guard for #1944: an abstract PROPERTY declaration is
    // still reported by its own arm, and still report-only, now that a
    // concrete field is a subject too.
    {
      code: `
        abstract class BaseForm {
          abstract handleSubmit: (data: string) => string;
        }
      `,
      errors: [{ messageId: 'callbackFunctionPrefix' }],
      output: null,
    },
    // Bug #1949 regression guard: the method spelling the rule already covered
    // still reports and still autofixes — the widening must not displace it.
    {
      code: `
        class C {
          handleClick(): void {}
          handleSubmit = (): void => {};
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: `
        class C {
          click(): void {}
          submit = (): void => {};
        }
      `,
    },
    // Bug #1949 regression guard: an object-literal member and a constructor
    // parameter property are on neither new path, and keep their answers — the
    // parameter property report-only, the object member rewritten.
    {
      code: `
        const config = { handleClick: onClick };
        class C {
          constructor(private readonly handleChange: () => void) {}
        }
      `,
      errors: [
        { messageId: 'callbackFunctionPrefix' },
        { messageId: 'callbackFunctionPrefix' },
      ],
      output: `
        const config = { click: onClick };
        class C {
          constructor(private readonly handleChange: () => void) {}
        }
      `,
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
const RULE_ID = 'test/consistent-callback-naming';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');
const PARSER_OPTIONS = {
  ecmaVersion: 2020 as const,
  sourceType: 'module' as const,
  ecmaFeatures: { jsx: true },
};

/**
 * The whole-file `--fix` result, shared by both harnesses below: one asks
 * whether the output parses (Bug #1719), the other whether it still type-checks
 * (Bug #1946). `fixed` is the convergence signal — comparing strings cannot
 * distinguish a converged fixer from one whose edits cancel out over an even
 * number of passes.
 */
const fixWholeFile = (code: string) => {
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
  );
};

describe('consistent-callback-naming --fix output parses (Bug #1719)', () => {
  const fix = (code: string) => fixWholeFile(code).output;

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

  // Bug #1949: the field spelling of the same rename, end to end.
  it('renames a class field end to end', () => {
    const output = fix(`class C {\n  handleClick = () => {};\n}\n`);

    expect(output).toBe(`class C {\n  click = () => {};\n}\n`);
    expect(parses(output)).toBe(true);
  });

  // Bug #1949: the reserved-word guard covers the field key too. `class C {
  // delete = fn }` happens to parse, so only a byte-identical output pins that
  // the fixer declined rather than emitting a keyword.
  it('never emits a reserved word for a class field rename', () => {
    const code = `class C {\n  handleDelete = () => {};\n}\n`;

    const output = fix(code);

    expect(output).toBe(code);
    expect(parses(output)).toBe(true);
  });

  /**
   * Bug #1944. Parsing is not the failure mode here — the broken output parsed
   * perfectly and failed to TYPE-check (TS2515 / TS2420), which this harness
   * cannot see. What it can pin is that the whole-file fixer leaves the file
   * byte-identical, which is what makes the type error impossible.
   */
  it.each([
    [
      'abstract member',
      `abstract class F {\n  abstract handleSubmit(d: string): string;\n}\nclass G extends F {\n  handleSubmit(d: string): string { return d; }\n}\n`,
    ],
    [
      'interface member',
      `interface F {\n  handleSubmit(d: string): string;\n}\nclass G implements F {\n  handleSubmit(d: string): string { return d; }\n}\n`,
    ],
    [
      'type literal member',
      `type F = {\n  handleSubmit(d: string): string;\n};\nclass G implements F {\n  handleSubmit(d: string): string { return d; }\n}\n`,
    ],
  ])('leaves a %s contract implementation unrenamed', (_label, code) => {
    const output = fix(code);

    expect(output).toBe(code);
    expect(parses(output)).toBe(true);
  });
});

/**
 * Bug #1946 whole-file check. The defect this guards against produced output
 * that parsed perfectly and failed to TYPE-check: the declaration was renamed
 * and `this.handleClick()` was left behind, so a clean build became
 * `TS2339: Property 'handleClick' does not exist on type 'C'`. Neither a
 * `RuleTester` `output` string nor the parse harness above can see that, so the
 * fixer's output is run through a real `ts.Program`.
 *
 * The comparison is DIFFERENTIAL — codes the output has that the input did not.
 * An absolute count says nothing: a fixture may legitimately carry a
 * diagnostic, and the question is only whether `--fix` added one.
 */
describe('consistent-callback-naming --fix output type-checks (Bug #1946)', () => {
  const COMPILER_OPTIONS: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    /**
     * `noUnusedLocals`/`noUnusedParameters` are deliberately ABSENT, unlike
     * every other `ts.Program` in this repo (#2234).
     *
     * The differential below would tolerate them, but the assertion under it
     * does not: `compiles every input clean` reads an ABSOLUTE diagnostic list
     * off each input, and 8 of the shapes declare a class the shape never
     * instantiates — TS6196 on the input side, measured. Giving those shapes a
     * use would change what they probe, because whether the class is EXPORTED
     * is one of the axes they vary. Turn these on only together with a shape
     * set that does not depend on that.
     */
  };

  /**
   * Diagnostic codes per source, from one `ts.Program` over all of them. A
   * virtual, delegating host keeps the real lib files (and therefore real
   * semantic analysis) while the sources stay in memory.
   */
  const VIRTUAL_DIR = '/virtual';

  const diagnosticCodes = (sources: readonly string[]): string[][] => {
    const files = new Map<string, string>(
      sources.map((code, index) => [
        `${VIRTUAL_DIR}/shape-${index}.ts`,
        // Every shape is compiled as a module. A source with no import or
        // export is a SCRIPT, whose top-level `class C` joins the global scope
        // and collides with every other shape's (TS2300), which would both mask
        // real diagnostics and invent phantom ones. The marker is appended
        // after linting, so it never reaches the rule.
        `${code}\nexport {};\n`,
      ]),
    );
    // A companion module for the shapes that import a binding of the NEW name
    // (Bug #1948). An unresolvable specifier reports `TS2307` and types the
    // import as `any`, which would swallow the very diagnostic those shapes
    // exist to detect.
    files.set(
      `${VIRTUAL_DIR}/helpers.ts`,
      'export const submit = (value: number): number => value;\n',
    );
    const host = ts.createCompilerHost(COMPILER_OPTIONS, true);
    const { getSourceFile, readFile, fileExists } = host;
    host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
      const virtual = files.get(name);
      return virtual === undefined
        ? getSourceFile.call(host, name, languageVersion, onError, shouldCreate)
        : ts.createSourceFile(name, virtual, languageVersion, true);
    };
    host.readFile = (name) => files.get(name) ?? readFile.call(host, name);
    host.fileExists = (name) => files.has(name) || fileExists.call(host, name);
    // Node module resolution gives up on a containing directory it believes
    // does not exist, and never asks `fileExists` at all — which is how the
    // companion module above resolved to `TS2307` while sitting right there.
    const { directoryExists } = host;
    host.directoryExists = (name) =>
      name === VIRTUAL_DIR || !!directoryExists?.call(host, name);

    const program = ts.createProgram([...files.keys()], COMPILER_OPTIONS, host);
    // Indexed by SHAPE, so the companion module above never shifts the answers.
    return sources.map((_source, index) => {
      const name = `${VIRTUAL_DIR}/shape-${index}.ts`;
      const source = program.getSourceFile(name) as ts.SourceFile;
      return [
        ...program.getSyntacticDiagnostics(source),
        ...program.getSemanticDiagnostics(source),
      ].map((diagnostic) => `TS${diagnostic.code}`);
    });
  };

  const SHAPES: [string, string][] = [
    [
      'the #1946 repro: exported class read through this',
      `export class C {\n  handleClick(): void {}\n  run(): void {\n    this.handleClick();\n  }\n}\n`,
    ],
    [
      'a private member of an exported class',
      `export class C {\n  private handleClick(): void {}\n  run(): void {\n    this.handleClick();\n  }\n}\n`,
    ],
    [
      'an optional-chained read',
      `class C {\n  handleClick(): void {}\n  run(): void {\n    this?.handleClick();\n  }\n}\n`,
    ],
    [
      'a read from a nested arrow',
      `class C {\n  handleClick(): void {}\n  run(items: number[]): void {\n    items.forEach(() => {\n      this.handleClick();\n    });\n  }\n}\n`,
    ],
    [
      'a static member read from a static method',
      `class C {\n  static handleClick(): void {}\n  static run(): void {\n    this.handleClick();\n  }\n}\n`,
    ],
    [
      'a computed read',
      `class C {\n  handleClick(): void {}\n  run(): void {\n    this['handleClick']();\n  }\n}\n`,
    ],
    [
      'a read through an instance',
      `class C {\n  handleClick(): void {}\n}\nconst c = new C();\nc.handleClick();\n`,
    ],
    [
      'an instance that leaves the module',
      `class C {\n  handleClick(): void {}\n  run(): void {\n    this.handleClick();\n  }\n}\nexport const c = new C();\n`,
    ],
    [
      'an implemented contract (#1944)',
      `interface S {\n  handleSubmit(d: string): string;\n}\nclass F implements S {\n  handleSubmit(d: string): string {\n    return d;\n  }\n}\nvoid new F();\n`,
    ],
    [
      'an object literal member',
      `const config = { handleClick: (): void => {} };\nvoid config;\n`,
    ],
    [
      'a function declaration and its call',
      `function handleSubmit(): void {}\nhandleSubmit();\n`,
    ],
    // Bug #1948. Each of these compiles clean and would compile broken if the
    // rename were applied — the codes measured on the shipping fixer are named
    // per shape so a future weakening reports the diagnostic it reintroduces.
    [
      'the #1948 repro: an inner const binds the new name (TS2349)',
      `function handleSubmit(): void {}\nexport function run(): void {\n  const submit = 1;\n  handleSubmit();\n  console.log(submit);\n}\n`,
    ],
    [
      'the arrow-variable spelling of the same capture (TS2349)',
      `const handleSubmit = (): void => {};\nexport function run(): void {\n  const submit = 1;\n  handleSubmit();\n  console.log(submit);\n}\n`,
    ],
    [
      'a parameter binding the new name (TS2349)',
      `function handleSubmit(): void {}\nexport function run(submit: number): void {\n  handleSubmit();\n  console.log(submit);\n}\n`,
    ],
    [
      'an inner function declaration of the new name (TS2554)',
      `function handleSubmit(): void {}\nexport function run(): void {\n  function submit(value: number): number {\n    return value;\n  }\n  handleSubmit();\n  console.log(submit(1));\n}\n`,
    ],
    [
      'a catch parameter binding the new name (TS18046)',
      `function handleSubmit(): void {}\nexport function run(): void {\n  try {\n    void 0;\n  } catch (submit) {\n    handleSubmit();\n    console.log(submit);\n  }\n}\n`,
    ],
    [
      'an import of the new name (TS2440)',
      `import { submit } from './helpers';\nfunction handleSubmit(): void {}\nexport function run(): void {\n  handleSubmit();\n  console.log(submit(1));\n}\n`,
    ],
    [
      'a class declaration of the new name (TS2348)',
      `function handleSubmit(): void {}\nexport function run(): void {\n  class submit {}\n  handleSubmit();\n  void new submit();\n}\n`,
    ],
    [
      'an enum declaration of the new name (TS2349)',
      `function handleSubmit(): void {}\nexport function run(): void {\n  enum submit {\n    A,\n  }\n  handleSubmit();\n  console.log(submit.A);\n}\n`,
    ],
    [
      'a reference nested three scopes under the binding (TS2349)',
      `function handleSubmit(): void {}\nexport function run(items: number[]): void {\n  const submit = 1;\n  items.forEach(() => {\n    if (submit) {\n      handleSubmit();\n    }\n  });\n}\n`,
    ],
    [
      'the reverse hazard: the new name taken at the declaration (TS2300)',
      `const submit = 1;\nfunction handleSubmit(): void {}\nexport function run(): void {\n  handleSubmit();\n  console.log(submit);\n}\n`,
    ],
    // The two arms that must STILL be rewritten. Without them the differential
    // above would be satisfied by a fixer that had simply stopped firing.
    [
      'a sibling block binding that encloses no reference',
      `function handleSubmit(): void {}\nexport function run(): void {\n  {\n    const submit = 1;\n    console.log(submit);\n  }\n  handleSubmit();\n}\n`,
    ],
    [
      'a recursive function whose own body holds the reference',
      `function handleRetry(count: number): void {\n  if (count > 0) {\n    handleRetry(count - 1);\n  }\n}\nconsole.log(handleRetry);\n`,
    ],
    // Bug #1949. A field has the binding sites a method has, so it inherits the
    // whole withholding story above — and the differential is what proves the
    // inheritance is real rather than asserted: a field rename that reached the
    // key and not `this.handleClick` would be the same TS2339 the method
    // spelling used to ship.
    [
      'the #1949 repro: a class field the file owns',
      `class C {\n  handleClick = (): void => {};\n  run(): void {\n    this.handleClick();\n  }\n}\n`,
    ],
    [
      'a public field of an exported class',
      `export class C {\n  handleClick = (): void => {};\n}\n`,
    ],
    [
      'a private field of an exported class',
      `export class C {\n  private handleClick = (): void => {};\n  run(): void {\n    this.handleClick();\n  }\n}\n`,
    ],
    [
      'a static class field read from a static method',
      `class C {\n  static handleClick = (): void => {};\n  static run(): void {\n    this.handleClick();\n  }\n}\n`,
    ],
    [
      'a class field with a computed read',
      `class C {\n  handleClick = (): void => {};\n  run(): void {\n    this['handleClick']();\n  }\n}\n`,
    ],
    [
      'a class field implementing a contract (#1944)',
      `interface S {\n  handleClick: () => void;\n}\nclass C implements S {\n  handleClick = (): void => {};\n}\nvoid new C();\n`,
    ],
    [
      'a declare class field',
      `class C {\n  declare handleClick: () => void;\n}\n`,
    ],
  ];

  const results = SHAPES.map(([, code]) => fixWholeFile(code));
  const before = diagnosticCodes(SHAPES.map(([, code]) => code));
  const after = diagnosticCodes(results.map((result) => result.output));

  it('compiles every input clean, so the differential means something', () => {
    expect(
      SHAPES.map(([label], index) => `${label}: ${before[index].join(',')}`),
    ).toEqual(SHAPES.map(([label]) => `${label}: `));
  });

  it('detects the break the fixer used to ship (control)', () => {
    // The pre-fix output of the first shape, written out by hand. Without this
    // the differential could pass on a harness that never sees a type error.
    const brokenByHand = `export class C {\n  click(): void {}\n  run(): void {\n    this.handleClick();\n  }\n}\n`;
    const [inputCodes, brokenCodes] = diagnosticCodes([
      SHAPES[0][1],
      brokenByHand,
    ]);

    expect(inputCodes).toEqual([]);
    expect(brokenCodes).toContain('TS2339');
  });

  it('rewrites exactly the shapes whose every reference it owns', () => {
    // Pinning both directions: a differential over shapes the fixer never
    // touched would pass forever while asserting nothing, and a withheld shape
    // silently starting to rewrite is the regression this suite exists for.
    expect(
      SHAPES.filter((_shape, index) => results[index].fixed).map(
        ([label]) => label,
      ),
    ).toEqual([
      'a private member of an exported class',
      'an optional-chained read',
      'a read from a nested arrow',
      'a static member read from a static method',
      'an object literal member',
      'a function declaration and its call',
      'a sibling block binding that encloses no reference',
      'a recursive function whose own body holds the reference',
      'the #1949 repro: a class field the file owns',
      'a private field of an exported class',
      'a static class field read from a static method',
    ]);
  });

  /**
   * Bug #1948 control. Every capture shape above is withheld, so the
   * differential over them would read identically if the fixer had stopped
   * firing altogether — or if the check were declaration-site-only and simply
   * withheld every enclosing scope. These are the two directions that pin it:
   * the same source with the intervening binding REMOVED must still be
   * rewritten, and the withheld output must be byte-identical to its input.
   */
  it('withholds by capture, not by giving up on the shape', () => {
    const captured = `function handleSubmit(): void {}\nexport function run(): void {\n  const submit = 1;\n  handleSubmit();\n  console.log(submit);\n}\n`;
    const uncaptured = `function handleSubmit(): void {}\nexport function run(): void {\n  const total = 1;\n  handleSubmit();\n  console.log(total);\n}\n`;

    expect(fixWholeFile(captured).output).toBe(captured);
    expect(fixWholeFile(uncaptured).output).toBe(
      `function submit(): void {}\nexport function run(): void {\n  const total = 1;\n  submit();\n  console.log(total);\n}\n`,
    );
  });

  /**
   * Bug #1948 detector control. Without a hand-written captured output the
   * per-shape differential could pass on a harness that never sees a capture:
   * the emitted reference is well-typed against a real binding, so only a CALL
   * of it produces a diagnostic at all.
   */
  it('detects the capture the fixer used to ship (control)', () => {
    const capturedByHand = `function submit(): void {}\nexport function run(): void {\n  const submit = 1;\n  submit();\n  console.log(submit);\n}\n`;
    const [inputCodes, capturedCodes] = diagnosticCodes([
      `function handleSubmit(): void {}\nexport function run(): void {\n  const submit = 1;\n  handleSubmit();\n  console.log(submit);\n}\n`,
      capturedByHand,
    ]);

    expect(inputCodes).toEqual([]);
    expect(capturedCodes).toContain('TS2349');
  });

  it.each(SHAPES.map(([label], index) => [label, index] as const))(
    'introduces no diagnostic into %s',
    (_label, index) => {
      expect(
        after[index].filter((code) => !before[index].includes(code)),
      ).toEqual([]);
    },
  );

  it.each(SHAPES.map(([label], index) => [label, index] as const))(
    'converges on %s',
    (_label, index) => {
      // `fixed` on a re-run, not string inequality: a fixer whose edits cancel
      // out over two passes returns the original text while still not having
      // converged.
      expect(fixWholeFile(results[index].output).fixed).toBe(false);
    },
  );
});
