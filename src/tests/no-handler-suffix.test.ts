import { ruleTesterTs } from '../utils/ruleTester';
import { noHandlerSuffix } from '../rules/no-handler-suffix';

ruleTesterTs.run('no-handler-suffix', noHandlerSuffix, {
  valid: [
    // Descriptive names without the handler suffix
    `
      const countCheckedInParticipants = async () => {};
      const processPaymentTransaction = async (payment: Payment) => payment;
    `,
    // Prefix-based naming remains allowed
    `function handleClick() {}`,
    // Allowed by explicit name allowlist
    {
      code: `const errorBoundaryHandler = () => {};`,
      options: [{ allowNames: ['errorBoundaryHandler'] }],
    },
    // Allowed through regex pattern allowlist
    {
      code: `const onboardingBoundaryHandler = () => {};`,
      options: [{ allowPatterns: ['BoundaryHandler$'] }],
    },
    // Ignored when class methods are excluded
    {
      code: `
        class EventEmitter {
          private eventHandler(event: Event) {
            return event.type;
          }
        }
      `,
      options: [{ ignoreClassMethods: true }],
    },
    // Ignored when class implements allowlisted interface
    {
      code: `
        interface ExternalHandler {
          onEvent(): void;
        }

        class MyHandler implements ExternalHandler {
          onEventHandler() {}
        }
      `,
      options: [{ interfaceAllowlist: ['ExternalHandler'] }],
    },
    // Ignored when class implements allowlisted qualified interface
    {
      code: `
        namespace External {
          export interface Handler {
            onEvent(): void;
          }
        }

        class MyHandler implements External.Handler {
          onEventHandler() {}
        }
      `,
      options: [{ interfaceAllowlist: ['External.Handler'] }],
    },
    // Ignored when class implements deeply nested allowlisted interface
    {
      code: `
        namespace External {
          export namespace Events {
            export namespace Contracts {
              export interface Handler {
                onEvent(): void;
              }
            }
          }
        }

        class MyHandler implements External.Events.Contracts.Handler {
          onEventHandler() {}
        }
      `,
      options: [{ interfaceAllowlist: ['External.Events.Contracts.Handler'] }],
    },
    // Ignored when class implementations are globally skipped
    {
      code: `
        interface ClickHandler {
          clickHandler(): void;
        }

        class Button implements ClickHandler {
          clickHandler() {}
        }
      `,
      options: [{ ignoreInterfaceImplementations: true }],
    },
    // Ignored for deeply nested interface when implementations are skipped
    {
      code: `
        namespace External {
          export namespace Events {
            export interface ClickHandler {
              onClick(): void;
            }
          }
        }

        class Button implements External.Events.ClickHandler {
          onClickHandler() {}
        }
      `,
      options: [{ ignoreInterfaceImplementations: true }],
    },
    // Ignored when variable annotation uses allowlisted qualified name
    {
      code: `
        namespace Api {
          export type Handler = () => void;
        }

        const apiHandler: Api.Handler = () => {};
      `,
      options: [{ interfaceAllowlist: ['Api.Handler'] }],
    },
    // Ignored when interface implementations are globally ignored (variable annotation)
    {
      code: `
        type EventHandler = () => void;
        const onClickHandler: EventHandler = () => {};
      `,
      options: [{ ignoreInterfaceImplementations: true }],
    },
    // Ignored by file pattern (e.g., Next.js API routes)
    {
      code: `export default function handler(req: NextApiRequest, res: NextApiResponse) {}`,
      filename: 'src/pages/api/users.ts',
      options: [{ allowFilePatterns: ['**/pages/api/**'] }],
    },
    // Computed object property should not be flagged
    `
      const keyHandler = 'doSomething';
      const callbacks = { [keyHandler]: () => {} };
    `,
    // Computed class method should not be flagged
    `
      const handlerKey = 'run';
      class Runner {
        [handlerKey]() {}
      }
    `,
    // Computed class field should not be flagged
    `
      const handlerKey = 'run';
      class Runner {
        [handlerKey] = () => {};
      }
    `,
    // Object methods without handler suffix stay valid
    `const callbacks = { onUserClick: () => {}, onUserClose: () => {} };`,
    // Non-function bindings ending with handler are ignored
    `const latestHandler = 3;`,
  ],
  invalid: [
    {
      code: `function countCheckedInHandler() {}`,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `const updateUserHandler = async (userId: string) => userId;`,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        class Payments {
          processPaymentHandler() {
            return true;
          }
        }
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        class Payments {
          processPaymentHandler = () => {};
        }
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        const callbacks = {
          validateInputHandler() {},
        };
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `export default function handler(req: NextApiRequest, res: NextApiResponse) {}`,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        const result = (function calculateTotalsHandler() {
          return 1;
        })();
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `const processHandlers = () => {};`,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `const handler = () => {};`,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        interface EventHandler {
          onEvent(): void;
        }

        class MyHandler implements EventHandler {
          onEventHandler() {}
        }
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `const errorBoundaryHandler = () => {};`,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        type EventHandler = () => void;
        const onClickHandler: EventHandler = () => {};
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        const nested = {
          inner: {
            computeSomethingHandler: () => {},
          },
        };
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
    {
      code: `
        const callbacks = {
          "saveHandler": () => {},
        };
      `,
      errors: [{ messageId: 'handlerSuffix' }],
    },
  ],
});

describe('no-handler-suffix configuration validation', () => {
  const createRuleValidator = noHandlerSuffix.create;
  const baseContext = {
    getFilename: () => 'src/file.ts',
    report: jest.fn(),
  } as unknown as Parameters<typeof createRuleValidator>[0];

  it('throws when allowPatterns contains invalid regex', () => {
    expect(() =>
      createRuleValidator({
        ...baseContext,
        options: [{ allowPatterns: ['[invalid'] }],
      } as Parameters<typeof createRuleValidator>[0]),
    ).toThrow(/invalid allowPatterns/i);
  });

  it('throws when allowPatterns contains unsafe regex', () => {
    expect(() =>
      createRuleValidator({
        ...baseContext,
        options: [{ allowPatterns: ['(a+)+$'] }],
      } as Parameters<typeof createRuleValidator>[0]),
    ).toThrow(/unsafe allowPatterns/i);
  });
});
