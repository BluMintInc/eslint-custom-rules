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
  ],
  invalid: [
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
      output: `
        type ChildProps = {
          validate: (value: string) => void;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child onValidate={fn} />;
      `,
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
      output: `
        type ChildProps = {
          submit?: (value: string) => void;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child onSubmit={fn} />;
      `,
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
      output: `
        type ChildProps = {
          submit: (() => void) | null;
        };
        const Child = (props: ChildProps) => <div />;
        const fn = () => {};
        const Parent = () => <Child onSubmit={fn} />;
      `,
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
      output: `
        type ChildProps = {
          validate: ((v: string) => void) | ((v: number) => void);
        };
        const Child = (props: ChildProps) => <div />;
        const fn = (v: string) => {};
        const Parent = () => <Child onValidate={fn} />;
      `,
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
      output: `
        interface Props {
          submitForm: (data: FormData) => Promise<void>;
          validateInput: (value: string) => void;
        }

        const Form = ({ submitForm, validateInput }: Props) => (
          <form>
            <input onValidateInput={validateInput} />
            <button onClick={() => submitForm(new FormData())}>Submit</button>
          </form>
        );
      `,
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
  ],
});
