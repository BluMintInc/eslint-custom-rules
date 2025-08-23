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
    // Valid: Deeply nested callback inside useCallback referencing parent scope
    {
      code: `
        const Component = useCallback(({ user, settings }) => {
          return (
            <div>
              {user.permissions.map(permission => (
                <div key={permission.id}>
                  <button onClick={() => {
                    if (permission.canEdit) {
                      settings.updatePermission(user.id, permission);
                    }
                  }}>
                    Edit {permission.name}
                  </button>
                </div>
              ))}
            </div>
          );
        }, [settings]);
      `,
    },
    // Valid: Callback with complex destructuring inside useCallback
    {
      code: `
        const Component = useCallback(({ data: { items, metadata }, onUpdate }) => {
          return (
            <div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onUpdate(item, metadata)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          );
        }, [onUpdate]);
      `,
    },
    // Valid: Callback accessing nested properties of parent parameters
    {
      code: `
        const Component = useCallback(({ config, handlers }) => {
          return (
            <form onSubmit={(e) => {
              e.preventDefault();
              handlers.onSubmit(config.formData);
            }}>
              <input />
            </form>
          );
        }, [handlers]);
      `,
    },
    // Valid: Multiple callbacks in same component, some referencing parent scope
    {
      code: `
        const Component = useCallback(({ items, onSelect, onDelete }) => {
          return (
            <div>
              {items.map(item => (
                <div key={item.id}>
                  <button onClick={() => onSelect(item)}>Select</button>
                  <button onClick={() => onDelete(item.id)}>Delete</button>
                </div>
              ))}
            </div>
          );
        }, [onSelect, onDelete]);
      `,
    },
    // Valid: Callback with conditional logic referencing parent scope
    {
      code: `
        const Component = useCallback(({ user, permissions }) => {
          return (
            <button onClick={() => {
              if (user.isAdmin || permissions.includes('edit')) {
                console.log('User can edit');
              }
            }}>
              Check Permissions
            </button>
          );
        }, [permissions]);
      `,
    },
    // Valid: Function expression (not arrow function) inside useCallback
    {
      code: `
        const Component = useCallback(({ data, onProcess }) => {
          return (
            <button onClick={function(e) {
              e.preventDefault();
              onProcess(data);
            }}>
              Process
            </button>
          );
        }, [onProcess]);
      `,
    },
    // Valid: Callback with try-catch referencing parent scope
    {
      code: `
        const Component = useCallback(({ apiClient, data }) => {
          return (
            <button onClick={() => {
              try {
                apiClient.send(data);
              } catch (error) {
                console.error('Failed to send data:', data.id);
              }
            }}>
              Send
            </button>
          );
        }, [apiClient]);
      `,
    },
    // Valid: Callback in render prop pattern inside useCallback
    {
      code: `
        const Component = useCallback(({ items, renderItem }) => {
          return (
            <DataProvider>
              {(providerData) => (
                <div>
                  {items.map(item => (
                    <div key={item.id}>
                      {renderItem(item, providerData)}
                    </div>
                  ))}
                </div>
              )}
            </DataProvider>
          );
        }, [renderItem]);
      `,
    },
    // Valid: Callback with rest parameters inside useCallback
    {
      code: `
        const Component = useCallback(({ handler, ...props }) => {
          return (
            <button onClick={(e) => {
              handler(e, props);
            }}>
              Click
            </button>
          );
        }, [handler]);
      `,
    },
    // Valid: Callback accessing array methods on parent scope
    {
      code: `
        const Component = useCallback(({ items, onFilter }) => {
          return (
            <button onClick={() => {
              const filtered = items.filter(item => item.active);
              onFilter(filtered);
            }}>
              Filter Active
            </button>
          );
        }, [onFilter]);
      `,
    },
    // Valid: Nested useCallback inside another useCallback
    {
      code: `
        const Component = useCallback(({ data, onUpdate }) => {
          const handleNestedAction = useCallback((item) => {
            onUpdate(data, item);
          }, [data, onUpdate]);

          return (
            <div>
              {data.items.map(item => (
                <button key={item.id} onClick={() => handleNestedAction(item)}>
                  {item.name}
                </button>
              ))}
            </div>
          );
        }, [onUpdate]);
      `,
    },
    // Valid: Callback with default parameters inside useCallback
    {
      code: `
        const Component = useCallback(({ items, onProcess = () => {} }) => {
          return (
            <button onClick={() => {
              items.forEach(item => onProcess(item));
            }}>
              Process All
            </button>
          );
        }, [onProcess]);
      `,
    },
    // Valid: Callback referencing parent scope in object method call
    {
      code: `
        const Component = useCallback(({ api, config }) => {
          return (
            <button onClick={() => {
              api.request({
                url: config.endpoint,
              }).catch((error) => {
                console.error('Failed to process data:', error);
              });
            }}>
              Process Async
            </button>
          );
        }, [api]);
      `,
    },
    // Valid: Nested callback inside useCallback that references parent scope (bug report scenario)
    {
      code: `
        const SelectableWrapper = useCallback(({ hit, children }) => {
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
        }, [setEvent, tournamentId]);
      `,
    },
    // Valid: String literal prop (non-function)
    {
      code: `
        const Component = () => {
          return <input placeholder="Enter text" />;
        };
      `,
    },
    // Valid: Number literal prop (non-function)
    {
      code: `
        const Component = () => {
          return <input maxLength={100} />;
        };
      `,
    },
    // Valid: Boolean literal prop (non-function)
    {
      code: `
        const Component = () => {
          return <input disabled={true} />;
        };
      `,
    },
    // Valid: Variable reference (non-function)
    {
      code: `
        const Component = () => {
          const title = "Click me";
          return <button title={title} />;
        };
      `,
    },
    // Valid: Complex object without functions wrapped in useMemo
    {
      code: `
        const Component = () => {
          const config = useMemo(() => ({
            theme: 'dark',
            size: 'large',
            nested: {
              color: 'blue',
              style: { fontWeight: 'bold' }
            }
          }), []);
          return <CustomButton config={config} />;
        };
      `,
    },
    // Valid: Array without functions
    {
      code: `
        const Component = () => {
          const items = ['item1', 'item2', 'item3'];
          return <List items={items} />;
        };
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
    // Invalid: Function expression (not arrow function) not in useCallback
    {
      code: `
        const Component = () => {
          return <button onClick={function() { console.log('clicked'); }} />;
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Complex inline function with multiple statements
    {
      code: `
        const Component = () => {
          return (
            <button onClick={() => {
              const data = { timestamp: Date.now() };
              console.log('Button clicked', data);
              localStorage.setItem('lastClick', JSON.stringify(data));
            }}>
              Click me
            </button>
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Inline async function
    {
      code: `
        const Component = () => {
          return (
            <button onClick={async () => {
              const response = await fetch('/api/data');
              console.log(await response.json());
            }}>
              Fetch Data
            </button>
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Object with multiple function properties
    {
      code: `
        const Component = () => {
          return (
            <CustomComponent
              handlers={{
                onClick: () => console.log('clicked'),
                onHover: () => console.log('hovered'),
                onFocus: () => console.log('focused')
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Array with multiple function elements
    {
      code: `
        const Component = () => {
          return (
            <ActionBar
              actions={[
                () => console.log('action1'),
                () => console.log('action2'),
                () => console.log('action3')
              ]}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Deeply nested object with function
    {
      code: `
        const Component = () => {
          return (
            <ComplexComponent
              config={{
                ui: {
                  theme: 'dark',
                  interactions: {
                    onClick: () => console.log('deep click')
                  }
                }
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Mixed object with functions and non-functions
    {
      code: `
        const Component = () => {
          return (
            <Widget
              settings={{
                title: 'My Widget',
                enabled: true,
                onUpdate: () => console.log('updated'),
                theme: 'light'
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Function in array element object
    {
      code: `
        const Component = () => {
          return (
            <MenuList
              items={[
                { label: 'Home', onClick: () => navigate('/home') },
                { label: 'About', onClick: () => navigate('/about') }
              ]}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Callback inside useCallback that doesn't reference parent scope variables
    {
      code: `
        const Component = useCallback(() => {
          const localVar = 'local';
          return (
            <button onClick={() => {
              console.log('Using local var:', localVar);
            }}>
              Click me
            </button>
          );
        }, []);
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Multiple inline callbacks in same component, none referencing parent scope
    {
      code: `
        const Component = useCallback(() => {
          return (
            <div>
              <button onClick={() => console.log('button1')}>Button 1</button>
              <button onClick={() => console.log('button2')}>Button 2</button>
            </div>
          );
        }, []);
      `,
      errors: [
        { messageId: 'enforceCallback' },
        { messageId: 'enforceCallback' },
      ],
    },
    // Invalid: Callback with conditional but no parent scope reference
    {
      code: `
        const Component = useCallback(() => {
          return (
            <button onClick={() => {
              if (Math.random() > 0.5) {
                console.log('Random success');
              }
            }}>
              Random Action
            </button>
          );
        }, []);
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Callback with try-catch but no parent scope reference
    {
      code: `
        const Component = useCallback(() => {
          return (
            <button onClick={() => {
              try {
                JSON.parse('invalid json');
              } catch (error) {
                console.error('Parse error');
              }
            }}>
              Parse JSON
            </button>
          );
        }, []);
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Callback referencing component state (not parent function params)
    {
      code: `
        const Component = () => {
          const [count, setCount] = useState(0);
          const wrapper = useCallback(() => {
            return (
              <button onClick={() => {
                setCount(count + 1);
              }}>
                Count: {count}
              </button>
            );
          }, [count]);
          return wrapper();
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Object with function in nested JSX
    {
      code: `
        const Component = () => {
          return (
            <Container>
              <Header
                config={{
                  title: 'Page Title',
                  onClose: () => console.log('closed')
                }}
              />
            </Container>
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Array with function in nested JSX
    {
      code: `
        const Component = () => {
          return (
            <Layout>
              <Sidebar
                menuItems={[
                  { name: 'Dashboard', action: () => navigate('/dashboard') }
                ]}
              />
            </Layout>
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Function as render prop without memoization
    {
      code: `
        const Component = () => {
          return (
            <DataProvider>
              {(data) => (
                <button onClick={() => console.log(data)}>
                  Show Data
                </button>
              )}
            </DataProvider>
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Multiple event handlers on same element
    {
      code: `
        const Component = () => {
          return (
            <button
              onClick={() => console.log('clicked')}
              onMouseEnter={() => console.log('entered')}
              onMouseLeave={() => console.log('left')}
            >
              Multi-handler Button
            </button>
          );
        };
      `,
      errors: [
        { messageId: 'enforceCallback' },
        { messageId: 'enforceCallback' },
        { messageId: 'enforceCallback' },
      ],
    },
    // Invalid: Function in form event handler
    {
      code: `
        const Component = () => {
          return (
            <form onSubmit={(e) => {
              e.preventDefault();
              console.log('Form submitted');
            }}>
              <input type="submit" />
            </form>
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function in input event handler
    {
      code: `
        const Component = () => {
          return (
            <input
              onChange={(e) => {
                console.log('Input changed:', e.target.value);
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function in custom component prop
    {
      code: `
        const Component = () => {
          return (
            <CustomModal
              onConfirm={() => {
                console.log('Confirmed');
                window.location.reload();
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Complex object with nested arrays containing functions
    {
      code: `
        const Component = () => {
          return (
            <ComplexWidget
              configuration={{
                sections: [
                  {
                    title: 'Actions',
                    buttons: [
                      { label: 'Save', handler: () => console.log('save') }
                    ]
                  }
                ]
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceMemo' }],
    },
    // Invalid: Function with parameter destructuring (not parent scope)
    {
      code: `
        const Component = () => {
          return (
            <UserList
              onUserSelect={({ id, name }) => {
                console.log('Selected user:', id, name);
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function with rest parameters (not parent scope)
    {
      code: `
        const Component = () => {
          return (
            <EventHandler
              onEvent={(...args) => {
                console.log('Event args:', args);
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function accessing this context (not parent scope)
    {
      code: `
        const Component = () => {
          return (
            <ContextButton
              onClick={function() {
                console.log('Context:', this);
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Arrow function with implicit return
    {
      code: `
        const Component = () => {
          return (
            <TransformButton
              onTransform={(data) => data.map(item => item.toUpperCase())}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function calling other functions (not parent scope)
    {
      code: `
        const Component = () => {
          return (
            <ProcessButton
              onProcess={() => {
                const result = processData();
                saveResult(result);
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function with template literals (not parent scope)
    {
      code: `
        const Component = () => {
          return (
            <LogButton
              onClick={() => {
                console.log(\`Button clicked at \${new Date().toISOString()}\`);
              }}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function in ternary operator
    {
      code: `
        const Component = () => {
          const isEnabled = true;
          return (
            <ConditionalButton
              onClick={isEnabled ? () => console.log('enabled') : () => console.log('disabled')}
            />
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
    // Invalid: Function in logical AND operator
    {
      code: `
        const Component = () => {
          const showButton = true;
          return (
            <div>
              {showButton && (
                <button onClick={() => console.log('conditional click')}>
                  Conditional Button
                </button>
              )}
            </div>
          );
        };
      `,
      errors: [{ messageId: 'enforceCallback' }],
    },
  ],
});
