import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceEarlyDestructuring } from '../rules/enforce-early-destructuring';

ruleTesterJsx.run('enforce-early-destructuring', enforceEarlyDestructuring, {
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
            const { current } = value ?? {};
            useLayoutEffect(() => {
              doSomething(current);
            }, [current]);
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
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              function helper() {
                const { name } = user;
                log(name);
              }
              helper();
            }, [user]);
          };
        `,
    },
    // A nested destructure behind a truthiness guard stays put: hoisting it above
    // the guard would dereference an object the guard exists to protect.
    {
      code: `
          const MyComponent = ({ user }: { user?: User }) => {
            useEffect(() => {
              if (!user) return;
              const { profile: { name, age } } = user;
              renderProfile(name, age);
            }, [user]);
          };
        `,
    },
    {
      code: `
          const MyComponent = ({ user }: { user?: User }) => {
            useEffect(() => {
              if (user.profile) {
                const { profile: { name, age } } = user;
                renderProfile(name, age);
              }
            }, [user]);
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

            const { canPlayAudio, startAudio } = audioPlayback ?? {};
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
          const MyComponent = ({ value }) => {
            useLayoutEffect(() => {
              const { current } = value;
              doSomething(current);
            }, [value]);
          };
        `,
      output: `
          const MyComponent = ({ value }) => {
            const { current } = value ?? {};
            useLayoutEffect(() => {
              doSomething(current);
            }, [current]);
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
            const { data: responseData } = response ?? {};
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
            const { timeout = 1000 } = config ?? {};
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
            const { name, age } = user ?? {};
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
            const { profile: { name, age } } = user ?? {};
            useEffect(() => {
              renderProfile(name, age);
            }, [name, age]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // Regression (#1523): the hoisted pattern must not gain a synthesized `= {}`.
    // `{}` provides no value for `name`/`age`, so TS reports TS2525 once per
    // binding and an input that compiled stops compiling after --fix.
    {
      code: `
          const Profile = ({ user }: { user: User }) => {
            useEffect(() => {
              const { profile: { name, age } } = user;
              renderProfile(name, age);
            }, [user]);
            return null;
          };
        `,
      output: `
          const Profile = ({ user }: { user: User }) => {
            const { profile: { name, age } } = user ?? {};
            useEffect(() => {
              renderProfile(name, age);
            }, [name, age]);
            return null;
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { id, profile: { name } } = user;
              render(id, name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { id, profile: { name } } = user ?? {};
            useEffect(() => {
              render(id, name);
            }, [id, name]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { profile: { address: { city } } } = user;
              render(city);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { profile: { address: { city } } } = user ?? {};
            useEffect(() => {
              render(city);
            }, [city]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // Defaults written by the author survive the hoist verbatim; only the
    // synthesized nested `= {}` is dropped.
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { profile: { name = 'Anonymous', age } } = user;
              renderProfile(name, age);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { profile: { name = 'Anonymous', age } } = user ?? {};
            useEffect(() => {
              renderProfile(name, age);
            }, [name, age]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // An object pattern nested inside an array pattern loses its `= {}` too; the
    // array's own `= []` is type-safe and stays.
    {
      code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { items: [{ id }] } = response;
              consume(id);
            }, [response]);
          };
        `,
      output: `
          const MyComponent = ({ response }) => {
            const { items: [{ id }] = [] } = response ?? {};
            useEffect(() => {
              consume(id);
            }, [id]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // An optional source only compiles when the destructure asserts non-null, and
    // the assertion carries through the hoist, so `?? {}` stays type-neutral.
    {
      code: `
          const MyComponent = ({ user }: { user?: User }) => {
            useEffect(() => {
              const { profile: { name } } = user!;
              renderProfile(name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }: { user?: User }) => {
            const { profile: { name } } = user! ?? {};
            useEffect(() => {
              renderProfile(name);
            }, [name]);
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
            const { canPlayAudio } = props.audioPlayback ?? {};
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
              const { items: [first, second] } = response;
              consume(first, second);
            }, [response]);
          };
        `,
      output: `
          const MyComponent = ({ response }) => {
            const { items: [first, second] = [] } = response ?? {};
            useEffect(() => {
              consume(first, second);
            }, [first, second]);
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
            const { items } = response?.data ?? {};
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
            const { value } = config ?? {};
            useEffect(() => {
              doSomething(value + offset);
            }, [offset, value]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user, extra }) => {
            const deps = useDeps();
            useEffect(() => {
              const { name } = user;
              doSomething(name, extra);
            }, [...deps, user, extra]);
          };
        `,
      output: `
          const MyComponent = ({ user, extra }) => {
            const deps = useDeps();
            const { name } = user ?? {};
            useEffect(() => {
              doSomething(name, extra);
            }, [...deps, extra, name]);
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
            const { name = 'Anonymous', age: userAge } = user ?? {};
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
            const { name } = user ?? {};
            useEffect(() => {
              logUser(name);
            }, [name]);
            const { address } = user ?? {};
            useEffect(() => {
              logAddress(address);
            }, [address]);
          };
        `,
      errors: [
        { messageId: 'hoistDestructuring' },
        { messageId: 'hoistDestructuring' },
      ],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              if (!user) return;
              logUser(name);
              console.log(user.status);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { name } = user ?? {};
            useEffect(() => {
              if (!user) return;
              logUser(name);
              console.log(user.status);
            }, [user, name]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user as User;
              logUser(name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { name } = (user as User) ?? {};
            useEffect(() => {
              logUser(name);
            }, [name]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // The hoisted initializer parenthesizes its source only when `??` needs it.
    // A plain identifier does not, and the stray pair Prettier then strips broke
    // `prettier --check` on autofixed consumer code (issue #1580).
    {
      code: `
          const MyComponent = ({ props }) => {
            useMemo(() => {
              const { sx } = props;
              return sx;
            }, [props]);
          };
        `,
      output: `
          const MyComponent = ({ props }) => {
            const { sx } = props ?? {};
            useMemo(() => {
              return sx;
            }, [sx]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // A member expression binds tighter than `??` too, so it also loses the pair.
    {
      code: `
          const MyComponent = ({ props }) => {
            useMemo(() => {
              const { canPlay } = props.audio;
              return canPlay;
            }, [props.audio]);
          };
        `,
      output: `
          const MyComponent = ({ props }) => {
            const { canPlay } = props.audio ?? {};
            useMemo(() => {
              return canPlay;
            }, [canPlay]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ obj1, obj2 }) => {
            useEffect(() => {
              if (conditionA) {
                const { id } = obj1;
                use(id);
              }
              if (conditionB) {
                const { id } = obj2;
                use(id);
              }
            }, [obj1, obj2]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => { const { name } = user; const extra = 1; log(name, extra); }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { name } = user ?? {};
            useEffect(() => { const extra = 1; log(name, extra); }, [name]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            const { name } = user ?? {};
            useEffect(() => {
              const { name } = user.profile;
              log(name);
            }, [user.profile]);
          };
        `,
      output: null,
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
              const { name } = user;
              audit(name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { name } = user ?? {};
            useEffect(() => {
              logUser(name);
            }, [name]);
            useEffect(() => {
              const { name } = user;
              audit(name);
            }, [user]);
          };
        `,
      errors: [
        { messageId: 'hoistDestructuring' },
        { messageId: 'hoistDestructuring' },
      ],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            const name = 'outer';
            if (condition) {
              useEffect(() => {
                const { name } = user;
                log(name);
              }, [user]);
              log(name);
            }
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ response }) => {
            const stuff = {
              computed: useMemo(() => {
                const { data } = response;
                return data;
              }, [response]),
            };
            return stuff;
          };
        `,
      output: `
          const MyComponent = ({ response }) => {
            const { data } = response ?? {};
            const stuff = {
              computed: useMemo(() => {
                return data;
              }, [data]),
            };
            return stuff;
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          type ApiResponse = { data: string };

          const MyComponent = ({ response }) => {
            useMemo(() => {
              const { data } = response satisfies ApiResponse;
              return data;
            }, [response]);
          };
        `,
      output: `
          type ApiResponse = { data: string };

          const MyComponent = ({ response }) => {
            const { data } = (response satisfies ApiResponse) ?? {};
            useMemo(() => {
              return data;
            }, [data]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              if (condition) {
                const { age: name } = user;
                log(name);
              }
              log(name);
            }, [user]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              if (condition) {
                const { age: name } = user;
                log(name);
              }
              log(name);
            }, [user]);

            useEffect(() => {
              const { name } = user;
              audit(name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              if (condition) {
                const { age: name } = user;
                log(name);
              }
              log(name);
            }, [user]);

            const { name } = user ?? {};
            useEffect(() => {
              audit(name);
            }, [name]);
          };
        `,
      errors: [
        { messageId: 'hoistDestructuring' },
        { messageId: 'hoistDestructuring' },
      ],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              const obj = { user: 123 };
              log(obj, name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { name } = user ?? {};
            useEffect(() => {
              const obj = { user: 123 };
              log(obj, name);
            }, [name]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name } = user;
              const obj = { user };
              log(obj, name);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { name } = user ?? {};
            useEffect(() => {
              const obj = { user };
              log(obj, name);
            }, [user, name]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const fallback = 'Anonymous';
              const { name = fallback } = user;
              log(name);
            }, [user]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const localKey = 'name';
              const { [localKey]: name } = user;
              log(name);
            }, [user]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { profile: { name } } = user;
              const { profile: { age } } = user;
              doSomething(name, age);
            }, [user]);
          };
        `,
      output: `
          const MyComponent = ({ user }) => {
            const { profile: { name }, profile: { age } } = user ?? {};
            useEffect(() => {
              doSomething(name, age);
            }, [name, age]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // The hoist rewrites the initializer to `(response) ?? {}`, which almost never
    // satisfies the declarator's annotation, so the fix is withheld rather than
    // dropping (or wrongly re-emitting) the annotation.
    {
      code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { data }: Payload = response;
              doSomething(data);
            }, [response]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { data }: { data: string } = response;
              doSomething(data);
            }, [response]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ response }) => {
            useMemo(() => {
              const { data }: Payload<string> = response;
              return data;
            }, [response]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { profile: { name } }: User = user;
              renderProfile(name);
            }, [user]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // An annotated declarator anywhere in the hoisted set withholds the entire
    // fix: hoisting only the unannotated half would rewrite the deps array while
    // leaving the annotated read behind, changing when the hook re-runs.
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name }: Named = user;
              const { age } = user;
              doSomething(name, age);
            }, [user]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      code: `
          const MyComponent = ({ user, config }) => {
            useEffect(() => {
              const { name }: Named = user;
              const { timeout } = config;
              doSomething(name, timeout);
            }, [user, config]);
          };
        `,
      output: null,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // Withholding is scoped to the report that owns the annotated declarator;
    // an unrelated hook in the same component still gets hoisted.
    {
      code: `
          const MyComponent = ({ user }) => {
            useEffect(() => {
              const { name }: Named = user;
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
            useEffect(() => {
              const { name }: Named = user;
              logUser(name);
            }, [user]);
            const { address } = user ?? {};
            useEffect(() => {
              logAddress(address);
            }, [address]);
          };
        `,
      errors: [
        { messageId: 'hoistDestructuring' },
        { messageId: 'hoistDestructuring' },
      ],
    },
    // Unannotated declarators keep the existing hoist byte-for-byte.
    {
      code: `
          const MyComponent = ({ response }) => {
            useEffect(() => {
              const { data } = response;
              doSomething(data);
            }, [response]);
          };
        `,
      output: `
          const MyComponent = ({ response }) => {
            const { data } = response ?? {};
            useEffect(() => {
              doSomething(data);
            }, [data]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
  ],
});
