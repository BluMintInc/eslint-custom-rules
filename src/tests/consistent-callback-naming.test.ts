import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterJsx } from '../utils/ruleTester';
import rule from '../rules/consistent-callback-naming';

type MessageId = 'callbackPropPrefix' | 'callbackFunctionPrefix';

const propMessage = (propName: string, suggestedName: string) =>
  `Callback prop "${propName}" is a function but does not use the "on" prefix. The "on" prefix marks event-style props so readers know they must pass a callback instead of data or a component. Rename it to "${suggestedName}" (and update the prop definition) so call sites make the callback contract explicit.`;

const handleMessage = (functionName: string, suggestedName: string) =>
  `Callback function "${functionName}" uses the generic "handle" prefix, which hides the action being performed and makes call sites read like plumbing instead of behavior. Use a verb phrase such as "${suggestedName}" to describe the side effect so handlers are self-documenting and easy to scan.`;

const withMessage = (
  message: string,
  data?: Record<string, unknown>,
): TSESLint.TestCaseError<MessageId> =>
  ({
    message,
    ...(data ? { data } : {}),
  } as unknown as TSESLint.TestCaseError<MessageId>);

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
  ],
  invalid: [
    // Function prop without 'on' prefix
    {
      code: `
        interface Props {
          submitForm: (data: FormData) => Promise<void>;
          validateInput: (value: string) => boolean;
        }

        const Form = ({ submitForm, validateInput }: Props) => (
          <form>
            <input validateInput={validateInput} />
            <button onClick={() => submitForm(new FormData())}>Submit</button>
          </form>
        );
      `,
      errors: [
        withMessage(propMessage('validateInput', 'onValidateInput')),
      ],
      output: `
        interface Props {
          submitForm: (data: FormData) => Promise<void>;
          validateInput: (value: string) => boolean;
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
      errors: [
        withMessage(handleMessage('handleSubmit', 'submit')),
      ],
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
        withMessage(handleMessage('handleSubmit', 'submit')),
        withMessage(handleMessage('handleValidate', 'validate')),
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
    // Multiple issues in one component
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
        withMessage(handleMessage('handleFormSubmit', 'formSubmit')),
        withMessage(handleMessage('handleValidation', 'validation')),
        withMessage(propMessage('validateInput', 'onValidateInput')),
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
              <input onValidateInput={handleValidation} />
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
        withMessage(handleMessage('handleEvents', 'events')),
        withMessage(handleMessage('handleEvent', 'event')),
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
        withMessage(handleMessage('handleClick', 'click')),
        withMessage(handleMessage('handleChange', 'change')),
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
