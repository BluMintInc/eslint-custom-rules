import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceEarlyDestructuring } from '../rules/enforce-early-destructuring';

ruleTesterJsx.run(
  'enforce-early-destructuring',
  enforceEarlyDestructuring,
  {
    valid: [
      {
        code: `
          const MyComponent = () => {
            const audioPlayback = useAudioPlayback();
            const { canPlayAudio, startAudio } = audioPlayback ?? {};

            useEffect(() => {
              if (!canPlayAudio) return;
              startAudio();
            }, [canPlayAudio, startAudio]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(async () => {
              if (!response) return;
              const { data } = response;
              await doSomething(data);
            }, [response]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const fetchData = async () => {
                const { data } = response;
                await doSomething(data);
              };
              fetchData();
            }, [response]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ value }) => {
            useLayoutEffect(() => {
              const { current } = value;
              doSomething(current);
            }, [value]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => doSomething(response), [response]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { data } = response || {};
              doSomething(data);
            });
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            const { data } = response ?? {};
            useEffect(() => {
              doSomething(data);
            }, [data]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { data } = { data: response };
              doSomething(data);
            }, [response]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              if (response.type === 'success') {
                const { data } = response;
                handleSuccess(data);
              }
            }, [response]);
          };
        `,
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            const { data } = response ?? {};
            const { items = [] } = data ?? {};
            useMemo(() => items.length, [items]);
          };
        `,
      },
    ],
    invalid: [
      {
        code: `
          const MyComponent = () => {
            const audioPlayback = useAudioPlayback();

            useEffect(() => {
              const { canPlayAudio, startAudio } = audioPlayback;
              if (!canPlayAudio) return;
              startAudio();
            }, [audioPlayback]);
          };
        `,
        output: `
          const MyComponent = () => {
            const audioPlayback = useAudioPlayback();

            const { canPlayAudio, startAudio } = (audioPlayback) ?? {};
            useEffect(() => {
              if (!canPlayAudio) return;
              startAudio();
            }, [canPlayAudio, startAudio]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              if (!response) return;
              const { data } = response;
              processData(data);
            }, [response]);
          };
        `,
        output: `
          const MyComponent = ({ response }) => {
            const { data } = (response) ?? {};
            useEffect(() => {
              if (!response) return;
              processData(data);
            }, [data]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useMemo(() => {
              const { data: responseData } = response;
              return responseData ? responseData.items : [];
            }, [response]);
          };
        `,
        output: `
          const MyComponent = ({ response }) => {
            const { data: responseData } = (response) ?? {};
            useMemo(() => {
              return responseData ? responseData.items : [];
            }, [responseData]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ config }) => {
            useCallback(() => {
              const { timeout = 1000 } = config;
              startTimer(timeout);
            }, [config]);
          };
        `,
        output: `
          const MyComponent = ({ config }) => {
            const { timeout = 1000 } = (config) ?? {};
            useCallback(() => {
              startTimer(timeout);
            }, [timeout]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              const { age } = user;
              doSomething(name, age);
            }, [user]);
          };
        `,
        output: `
          const MyComponent = ({ user }) => {
            const { name, age } = (user) ?? {};
            useEffect(() => {
              doSomething(name, age);
            }, [name, age]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { profile: { name, age } } = user;
              renderProfile(name, age);
            }, [user]);
          };
        `,
        output: `
          const MyComponent = ({ user }) => {
            const { profile: { name, age } } = (user) ?? {};
            useEffect(() => {
              renderProfile(name, age);
            }, [name, age]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ props }) => {
            useEffect(() => {
              const { canPlayAudio } = props.audioPlayback;
              return canPlayAudio;
            }, [props.audioPlayback]);
          };
        `,
        output: `
          const MyComponent = ({ props }) => {
            const { canPlayAudio } = (props.audioPlayback) ?? {};
            useEffect(() => {
              return canPlayAudio;
            }, [canPlayAudio]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { items } = response?.data;
              doSomething(items);
            }, [response?.data]);
          };
        `,
        output: `
          const MyComponent = ({ response }) => {
            const { items } = (response?.data) ?? {};
            useEffect(() => {
              doSomething(items);
            }, [items]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ config, offset }) => {
            useEffect(() => {
              const { value } = config;
              doSomething(value + offset);
            }, [config, offset]);
          };
        `,
        output: `
          const MyComponent = ({ config, offset }) => {
            const { value } = (config) ?? {};
            useEffect(() => {
              doSomething(value + offset);
            }, [offset, value]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ user }) => {
            useCallback(() => {
              const { name = 'Anonymous', age: userAge } = user;
              logUser(name, userAge);
            }, [user]);
          };
        `,
        output: `
          const MyComponent = ({ user }) => {
            const { name = 'Anonymous', age: userAge } = (user) ?? {};
            useCallback(() => {
              logUser(name, userAge);
            }, [name, userAge]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }],
      },
      {
        code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              logUser(name);
            }, [user]);
            useEffect(() => {
              const { address } = user;
              logAddress(address);
            }, [user]);
          };
        `,
        output: `
          const MyComponent = ({ user }) => {
            const { name } = (user) ?? {};
            useEffect(() => {
              logUser(name);
            }, [name]);
            const { address } = (user) ?? {};
            useEffect(() => {
              logAddress(address);
            }, [address]);
          };
        `,
        errors: [{ messageId: 'hoistDestructuring' }, { messageId: 'hoistDestructuring' }],
      },
    ],
  },
);
