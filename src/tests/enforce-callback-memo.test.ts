import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../rules/enforce-callback-memo';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('enforce-callback-memo', rule, {
  valid: [
    // Valid: Function wrapped with useCallback
    {
      code: `
        const Component = () => {
          const handleClick = useCallback(() => {
            console.log('clicked');
          }, []);
          return <button onClick={handleClick} />;
        };
      `,
    },
    // Valid: Object with function wrapped with useMemo
    {
      code: `
        const Component = () => {
          const config = useMemo(() => ({
            onClick: () => console.log('clicked')
          }), []);
          return <CustomButton {...config} />;
        };
      `,
    },
    // Valid: Array with function wrapped with useMemo
    {
      code: `
        const Component = () => {
          const buttons = useMemo(() => [
            { onClick: () => console.log('clicked') }
          ], []);
          return <DialogActions buttons={buttons} />;
        };
      `,
    },
    // Valid: Non-function prop
    {
      code: `
        const Component = () => {
          return <button title="Click me" />;
        };
      `,
    },
    // Valid: JSX element with function prop wrapped in useMemo
    {
      code: `
        const Component = () => {
          const control = useMemo(() => (
            <EditableBoolean
              value={enabled}
              onChange={updateGroupNotificationSettings(preferences, mode)}
            />
          ), [enabled, updateGroupNotificationSettings, preferences, mode]);
          return <FormControlLabel control={control} label="Toggle" />;
        };
      `,
    },
    // Valid: Inline callback inside useCallback that references parent scope variables
    {
      code: `
        const SelectableWrapper = useCallback<RenderWrapper<EventHit<Date>, Date>>(
          ({ hit, children }) => {
            return (
              <Selectable
                isSelected={id === tournamentId}
                onChange={(_, isSelected) => {
                  if (isSelected) {
                    setEvent(hit);
                  }
                }}
              >
                {children}
              </Selectable>
            );
          },
          [setEvent, tournamentId],
        );
      `,
    },
    // Valid: Multiple nested callbacks inside useCallback that reference parent scope
    {
      code: `
        const Component = useCallback(({ items, onSelect }) => {
          return (
            <div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => console.log(item.name)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          );
        }, [onSelect]);
      `,
    },
    // Valid: Callback inside useCallback with destructured props
    {
      code: `
        const FormWrapper = useCallback(({ formData, onSubmit }) => {
          return (
            <form onSubmit={(e) => {
              e.preventDefault();
              onSubmit(formData);
            }}>
              <input />
            </form>
          );
        }, [onSubmit]);
      `,
    },
  ],
  invalid: [
    // Invalid: Inline function
    {
      code: `
        const Component = () => {
          return <button onClick={() => console.log('clicked')} />;
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Object with inline function
    {
      code: `
        const Component = () => {
          return <CustomButton config={{ onClick: () => console.log('clicked') }} />;
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Array with inline function
    {
      code: `
        const Component = () => {
          return <DialogActions buttons={[{ onClick: () => console.log('clicked') }]} />;
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Nested object with inline function
    {
      code: `
        const Component = () => {
          return <CustomComponent data={{ nested: { handler: () => {} } }} />;
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: JSX element with function prop as control
    {
      code: `
        const Component = () => {
          return (
            <FormControlLabel
              control={
                <EditableBoolean
                  value={enabled}
                  onChange={() => console.log('changed')}
                />
              }
              label="Toggle"
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Inline callback NOT inside useCallback
    {
      code: `
        const Component = () => {
          return (
            <button onClick={(e) => {
              e.preventDefault();
              console.log('clicked');
            }}>
              Click me
            </button>
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Inline callback inside useCallback but doesn't reference parent scope
    {
      code: `
        const Component = useCallback(() => {
          return (
            <button onClick={() => {
              console.log('clicked');
            }}>
              Click me
            </button>
          );
        }, []);
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Inline callback that references global variables, not parent scope
    {
      code: `
        const Component = useCallback(() => {
          return (
            <button onClick={() => {
              console.log(globalVariable);
            }}>
              Click me
            </button>
          );
        }, []);
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
  ],
});
