import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
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
    // Issue #1956: the hook call does not begin its line, so the line start is
    // outside the component. The declaration reads the component's own
    // parameter, so hoisting it there unbinds it.
    {
      name: 'hoists inside a component body written on one line',
      code: `
          const MyComponent = ({ value }) => { useLayoutEffect(() => { const { current } = value; doSomething(current); }, [value]); };
        `,
      output: `
          const MyComponent = ({ value }) => { const { current } = value ?? {}; useLayoutEffect(() => { doSomething(current); }, [current]); };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      name: 'hoists beside a sibling declared ahead of the hook on its line',
      code: `
          const MyComponent = ({ value }) => {
            const other = 1; useLayoutEffect(() => {
              const { current } = value;
              doSomething(current, other);
            }, [value]);
          };
        `,
      output: `
          const MyComponent = ({ value }) => {
            const other = 1; const { current } = value ?? {}; useLayoutEffect(() => {
              doSomething(current, other);
            }, [current]);
          };
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    {
      name: 'hoists inside a one-line function declaration body',
      code: `
          function useThing(props) { useEffect(() => { const { id } = props; track(id); }, [props]); }
        `,
      output: `
          function useThing(props) { const { id } = props ?? {}; useEffect(() => { track(id); }, [id]); }
        `,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
  ],
});

// Issue #1993: only a guard NAMING the destructured object used to hold the
// hoist back, so the ubiquitous `if (ready)` / `if (!isLoaded) return;` / `try`
// spellings were invisible. The synthesized `?? {}` rescues the ROOT alone — a
// nested pattern is re-emitted verbatim (#1523) — so a nested destructure
// hoisted past such a guard dereferences an undefined intermediate on every
// render, from the component body, before the effect is even queued.
ruleTesterJsx.run('enforce-early-destructuring', enforceEarlyDestructuring, {
  valid: [
    // The destructure is licensed by a guard on an UNRELATED boolean; hoisting a
    // nested pattern above it dereferences user.profile unguarded on every render.
    `const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (ready) {
      const { profile: { name, age } } = user;
      renderProfile(name, age);
    }
  }, [user, ready]);
};`,
    // An early return on an unrelated boolean guards the statements after it just
    // as an enclosing `if` guards the statements inside it.
    `const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (!ready) return;
    const { profile: { name, age } } = user;
    renderProfile(name, age);
  }, [user, ready]);
};`,
    // Depth beyond two loses the same way: every level below the root is
    // re-emitted with no rescue of its own.
    `const MyComponent = ({ user, isLoaded }) => {
  useEffect(() => {
    if (isLoaded) {
      const { profile: { address: { city } } } = user;
      renderCity(city);
    }
  }, [user, isLoaded]);
};`,
    // A non-null assertion is the author's claim about the guarded branch, not
    // about the component body the hoist would move the read into.
    `const MyComponent = ({ cfg, ready }: { cfg?: Config; ready: boolean }) => {
  useEffect(() => {
    if (ready) {
      const { a: { b } } = cfg!;
      use(b);
    }
  }, [cfg, ready]);
};`,
    // `try` licenses the dereference by catching it; hoisting moves the read out
    // from under the handler that made it safe.
    `const MyComponent = ({ user }) => {
  useEffect(() => {
    try {
      const { profile: { name } } = user;
      renderProfile(name);
    } catch {
      fallback();
    }
  }, [user]);
};`,
  ],
  invalid: [
    // Boundary control: the FLAT pattern under the same unrelated guard keeps
    // hoisting. `?? {}` rescues a nullish root, so there is nothing left below it
    // to dereference — declining here would disable the rule's main arm instead
    // of fixing the nested one.
    {
      name: 'hoists a flat pattern out from under an unrelated guard',
      code: `const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (ready) {
      const { name } = user;
      renderName(name);
    }
  }, [user, ready]);
};`,
      output: `const MyComponent = ({ user, ready }) => {
  const { name } = user ?? {};
  useEffect(() => {
    if (ready) {
      renderName(name);
    }
  }, [ready, name]);
};`,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
    // A nested pattern reached on every pass through the callback still hoists:
    // the decline is keyed on the guard, not on the shape alone.
    {
      name: 'hoists a nested pattern that no guard controls',
      code: `const MyComponent = ({ user }) => {
  useEffect(() => {
    const { profile: { name, age } } = user;
    renderProfile(name, age);
  }, [user]);
};`,
      output: `const MyComponent = ({ user }) => {
  const { profile: { name, age } } = user ?? {};
  useEffect(() => {
    renderProfile(name, age);
  }, [name, age]);
};`,
      errors: [{ messageId: 'hoistDestructuring' }],
    },
  ],
});

// Issue #1956: the hoist was anchored to the start of the LINE holding the hook
// call rather than to the call itself. Those offsets coincide only while the
// call opens its line; when the component body is written on one line the line
// start is offset 0, so the declaration was emitted ABOVE the component and the
// parameter it destructures went out of scope.
//
// The damage is invisible to every report-counting guard, which is why this
// block exists: the rewritten file reports ZERO afterwards. `--fix` exits 0 and
// the only surviving signal is a TypeScript error in a file the linter just
// rewrote. So the oracle is a CHECKER DIFFERENTIAL — diagnostics on the output
// minus diagnostics the input already carried — and not a re-lint, which cannot
// see an unresolved identifier.
const RULE_ID = '@blumintinc/blumint/enforce-early-destructuring';
const FILENAME = 'Component.tsx';

const createLinter = () => {
  const linter = new Linter();
  linter.defineParser(
    '@typescript-eslint/parser',
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@typescript-eslint/parser'),
  );
  linter.defineRule(
    RULE_ID,
    enforceEarlyDestructuring as unknown as Rule.RuleModule,
  );
  return linter;
};

const LINT_CONFIG = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022 as const,
    sourceType: 'module' as const,
    ecmaFeatures: { jsx: true },
  },
  rules: { [RULE_ID]: 'error' as const },
};

const fix = (code: string) =>
  createLinter().verifyAndFix(code, LINT_CONFIG, FILENAME);

const verify = (code: string) =>
  createLinter().verify(code, LINT_CONFIG, FILENAME);

describe('enforce-early-destructuring: the hoist stays in scope wherever the hook sits (issue #1956)', () => {
  // Declaring the helpers keeps the baseline clean, so any diagnostic the
  // differential reports is attributable to the hoist and not to the fixture
  // referencing globals a bare program has never heard of.
  const PRELUDE = [
    'declare const useLayoutEffect: (fn: () => void, deps: unknown[]) => void;',
    'declare const useEffect: (fn: () => void, deps: unknown[]) => void;',
    'declare const doSomething: (...args: unknown[]) => void;',
    'declare const track: (...args: unknown[]) => void;',
    '',
  ].join('\n');

  const diagnosticCodesOf = (source: string): number[] => {
    const name = 'probe.ts';
    const sourceFile = ts.createSourceFile(
      name,
      PRELUDE + source,
      ts.ScriptTarget.ES2020,
      true,
    );
    const host: ts.CompilerHost = {
      getSourceFile: (requested) =>
        requested === name ? sourceFile : undefined,
      writeFile: () => undefined,
      getDefaultLibFileName: () => 'lib.d.ts',
      useCaseSensitiveFileNames: () => true,
      getCanonicalFileName: (n) => n,
      getCurrentDirectory: () => '',
      getNewLine: () => '\n',
      fileExists: (requested) => requested === name,
      readFile: () => undefined,
    };
    const program = ts.createProgram(
      [name],
      { noEmit: true, noLib: true, strict: false },
      host,
    );
    return [
      ...program.getSemanticDiagnostics(sourceFile),
      ...program.getSyntacticDiagnostics(sourceFile),
    ].map((d) => d.code);
  };

  /** Diagnostics the fix introduced — the input's own are not the fix's fault. */
  const introducedBy = (input: string, output: string): number[] => {
    const before = diagnosticCodesOf(input);
    return diagnosticCodesOf(output).filter((code) => !before.includes(code));
  };

  const expectHoistStaysInScope = (code: string) => {
    // A fixture that never parsed, or that the rule declined, would satisfy
    // every assertion below vacuously, so the run must be shown to report and
    // to rewrite its input first.
    expect(verify(code).length).toBeGreaterThan(0);
    expect(diagnosticCodesOf(code)).toHaveLength(0);

    const first = fix(code);
    expect(first.fixed).toBe(true);

    // Re-fixing is the convergence detector: comparing the two strings would
    // score an even-length oscillation as converged.
    expect(fix(first.output).fixed).toBe(false);
    expect(verify(first.output)).toHaveLength(0);
    expect(introducedBy(code, first.output)).toEqual([]);

    return first.output;
  };

  it('keeps the hoist inside a component body written on one line', () => {
    const output = expectHoistStaysInScope(
      `const MyComponent = ({ value }) => { useLayoutEffect(() => { const { current } = value; doSomething(current); }, [value]); };\n`,
    );
    // The declaration must follow the arrow that binds `value`, not precede it.
    expect(output.indexOf('const { current } = value ?? {};')).toBeGreaterThan(
      output.indexOf('=>'),
    );
  });

  it('converges on the multi-line spelling without changing its layout', () => {
    const code = `const MyComponent = ({ value }) => {
  useLayoutEffect(() => {
    const { current } = value;
    doSomething(current);
  }, [value]);
};
`;
    // The own-line branch is byte-identical to the pre-fix behaviour, which is
    // what makes the anchoring change safe for every existing fixture.
    expect(expectHoistStaysInScope(code))
      .toBe(`const MyComponent = ({ value }) => {
  const { current } = value ?? {};
  useLayoutEffect(() => {
    doSomething(current);
  }, [current]);
};
`);
  });

  it('keeps the hoist beside a sibling declared ahead of the hook', () => {
    const output = expectHoistStaysInScope(`const MyComponent = ({ value }) => {
  const other = 1; useLayoutEffect(() => {
    const { current } = value;
    doSomething(current, other);
  }, [value]);
};
`);
    expect(output).toContain(
      'const other = 1; const { current } = value ?? {}; useLayoutEffect(',
    );
  });

  it('keeps the hoist inside a one-line function declaration body', () => {
    const output = expectHoistStaysInScope(
      `function useThing(props) { useEffect(() => { const { id } = props; track(id); }, [props]); }\n`,
    );
    expect(output).toContain('{ const { id } = props ?? {}; useEffect(');
  });

  it('keeps the hoist inside a body nested in an object method on one line', () => {
    const output = expectHoistStaysInScope(
      `export const hooks = { useThing(props) { useEffect(() => { const { id } = props; track(id); }, [props]); } };\n`,
    );
    expect(output).toContain('{ const { id } = props ?? {}; useEffect(');
  });

  it('would have caught the bug: the pre-fix output is rejected by the oracle', () => {
    const input = `const MyComponent = ({ value }) => { useLayoutEffect(() => { const { current } = value; doSomething(current); }, [value]); };\n`;
    // Verbatim output of the line-anchored fixer, kept as a planted positive
    // control so a regression cannot pass this block silently.
    const preFixOutput = `const { current } = value ?? {};\nconst MyComponent = ({ value }) => { useLayoutEffect(() => { doSomething(current); }, [current]); };\n`;

    // Both halves matter: it re-lints CLEAN (so a report-counting guard scores
    // it a success) while the checker sees an unbound identifier.
    expect(verify(preFixOutput)).toHaveLength(0);
    expect(introducedBy(input, preFixOutput)).toContain(2304);
  });

  it('leaves a compliant one-line component byte-for-byte alone (negative control)', () => {
    const code = `const MyComponent = ({ value }) => { const { current } = value ?? {}; useLayoutEffect(() => { doSomething(current); }, [current]); };\n`;
    expect(verify(code)).toHaveLength(0);
    const result = fix(code);
    expect(result.fixed).toBe(false);
    expect(result.output).toBe(code);
  });
});

// Issue #1993: this residue is invisible to every static instrument. The hoisted
// output re-lints clean and compiles clean — the non-null-assertion arm even
// under `strict: true` — so the checker differential the #1956 block relies on
// reports nothing here. EXECUTION is the oracle: under a React-shaped stub where
// effects run after the component body, the guarded input never destructures
// while the guard is false, while the hoisted spelling dereferences an
// intermediate that `?? {}` does not reach, from the body, on every render.
describe('enforce-early-destructuring: an unrelated guard licenses a nested destructure (issue #1993)', () => {
  const STUBS = [
    'const effects = [];',
    'const useEffect = (effect) => effects.push(effect);',
    'const renderProfile = () => undefined;',
    'const renderName = () => undefined;',
    'const renderCity = () => undefined;',
    'const use = () => undefined;',
    'const fallback = () => undefined;',
  ].join('\n');

  /** The error a render — body first, then the queued effects — throws, if any. */
  const renderError = (
    source: string,
    props: Record<string, unknown>,
  ): Error | null => {
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const program = `${STUBS}\n${compiled}\nMyComponent(props);\neffects.forEach((effect) => effect());`;
    try {
      // eslint-disable-next-line no-new-func
      new Function('props', program)(props);
      return null;
    } catch (error) {
      return error as Error;
    }
  };

  type Arm = {
    label: string;
    input: string;
    props: Record<string, unknown>;
    // Verbatim output of the pre-fix fixer, kept as a planted positive control
    // so a regression cannot pass this block silently.
    hoisted: string;
    missing: string;
  };

  const ARMS: Arm[] = [
    {
      label: 'an enclosing guard on an unrelated boolean',
      props: { user: {}, ready: false },
      missing: 'name',
      input: `const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (ready) {
      const { profile: { name, age } } = user;
      renderProfile(name, age);
    }
  }, [user, ready]);
};
`,
      hoisted: `const MyComponent = ({ user, ready }) => {
  const { profile: { name, age } } = user ?? {};
  useEffect(() => {
    if (ready) {
      renderProfile(name, age);
    }
  }, [ready, name, age]);
};
`,
    },
    {
      label: 'an early return on an unrelated boolean',
      props: { user: {}, ready: false },
      missing: 'name',
      input: `const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (!ready) return;
    const { profile: { name, age } } = user;
    renderProfile(name, age);
  }, [user, ready]);
};
`,
      hoisted: `const MyComponent = ({ user, ready }) => {
  const { profile: { name, age } } = user ?? {};
  useEffect(() => {
    if (!ready) return;
    renderProfile(name, age);
  }, [ready, name, age]);
};
`,
    },
    {
      label: 'a three-deep pattern behind a loading flag',
      props: { user: { profile: {} }, isLoaded: false },
      missing: 'city',
      input: `const MyComponent = ({ user, isLoaded }) => {
  useEffect(() => {
    if (isLoaded) {
      const { profile: { address: { city } } } = user;
      renderCity(city);
    }
  }, [user, isLoaded]);
};
`,
      hoisted: `const MyComponent = ({ user, isLoaded }) => {
  const { profile: { address: { city } } } = user ?? {};
  useEffect(() => {
    if (isLoaded) {
      renderCity(city);
    }
  }, [isLoaded, city]);
};
`,
    },
    {
      label: 'a non-null assertion asserted about the guarded branch',
      props: { cfg: undefined, ready: false },
      missing: 'b',
      input: `const MyComponent = ({ cfg, ready }: { cfg?: Config; ready: boolean }) => {
  useEffect(() => {
    if (ready) {
      const { a: { b } } = cfg!;
      use(b);
    }
  }, [cfg, ready]);
};
`,
      hoisted: `const MyComponent = ({ cfg, ready }: { cfg?: Config; ready: boolean }) => {
  const { a: { b } } = cfg! ?? {};
  useEffect(() => {
    if (ready) {
      use(b);
    }
  }, [ready, b]);
};
`,
    },
    {
      label: 'a try block whose handler is the guard',
      props: { user: {} },
      missing: 'name',
      input: `const MyComponent = ({ user }) => {
  useEffect(() => {
    try {
      const { profile: { name } } = user;
      renderProfile(name);
    } catch {
      fallback();
    }
  }, [user]);
};
`,
      hoisted: `const MyComponent = ({ user }) => {
  const { profile: { name } } = user ?? {};
  useEffect(() => {
    try {
      renderProfile(name);
    } catch {
      fallback();
    }
  }, [name]);
};
`,
    },
  ];

  it.each(ARMS.map((arm) => [arm.label, arm] as const))(
    'leaves the destructure under %s alone',
    (_label, arm) => {
      expect(renderError(arm.input, arm.props)).toBeNull();
      expect(verify(arm.input)).toHaveLength(0);
      expect(fix(arm.input).fixed).toBe(false);

      const thrown = renderError(arm.hoisted, arm.props);
      expect(thrown).toBeInstanceOf(TypeError);
      expect(thrown?.message).toContain(
        `Cannot read properties of undefined (reading '${arm.missing}')`,
      );
    },
  );

  it('keeps hoisting the flat pattern under the same guard (boundary control)', () => {
    const input = `const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (ready) {
      const { name } = user;
      renderName(name);
    }
  }, [user, ready]);
};
`;
    const props = { user: {}, ready: false };
    expect(renderError(input, props)).toBeNull();

    const result = fix(input);
    expect(result.fixed).toBe(true);
    expect(result.output).toContain('const { name } = user ?? {};');
    // `?? {}` rescues the root, and a flat pattern binds nothing below it, so the
    // hoisted read survives the same props that break every nested arm above.
    expect(renderError(result.output, props)).toBeNull();
  });
});
