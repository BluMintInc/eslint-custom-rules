import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceEarlyDestructuring } from '../rules/enforce-early-destructuring';

ruleTesterJsx.run('enforce-early-destructuring', enforceEarlyDestructuring, {
  valid: [
    // Already destructuring outside the hook
    {
      code: `
        const MyComponent = () => {
          const audioPlayback = useAudioPlayback();
          const { canPlayAudio, startAudio } = audioPlayback;

          useEffect(() => {
            if (!canPlayAudio) return;
            startAudio();
          }, [canPlayAudio, startAudio]);
        };
      `,
    },
    // No destructuring needed
    {
      code: `
        const MyComponent = () => {
          const count = useState(0);

          useEffect(() => {
            console.log(count);
          }, [count]);
        };
      `,
    },
    // Using specific fields directly in dependency array
    {
      code: `
        const MyComponent = () => {
          const user = getUser();

          useEffect(() => {
            console.log(user.name);
          }, [user.name]);
        };
      `,
    },

    // Async function destructuring (should be valid as we can't easily move it)
    {
      code: `
        const MyComponent = () => {
          const api = useApi();

          useEffect(() => {
            const fetchData = async () => {
              const response = await api.get();
              const { data } = response;
              setData(data);
            };
            fetchData();
          }, [api]);
        };
      `,
    },
    // Using object for debugging/logging only
    {
      code: `
        const MyComponent = () => {
          const user = getUser();

          useEffect(() => {
            console.log('Debug user:', user);
          }, [user]);
        };
      `,
    },
    // Using optional chaining
    {
      code: `
        const MyComponent = () => {
          const user = getUser();
          const name = user?.name;

          useEffect(() => {
            if (name) {
              console.log(name);
            }
          }, [name]);
        };
      `,
    },
  ],
  invalid: [
    // Basic case - destructuring inside useEffect
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
      errors: [
        {
          messageId: 'enforceEarlyDestructuring',
          data: {
            fields: 'canPlayAudio, startAudio',
          },
        },
      ],
      output: `
        const MyComponent = () => {
          const audioPlayback = useAudioPlayback();
          const { canPlayAudio, startAudio } = audioPlayback;
          
          useEffect(() => {
            if (!canPlayAudio) return;
            startAudio();
          }, [canPlayAudio, startAudio]);
        };
      `,
    },
    // Conditional destructuring case
    {
      code: `
        const MyComponent = () => {
          const response = fetchData();

          useEffect(() => {
            if (!response?.data) return;
            const { data } = response;
            processData(data);
          }, [response]);
        };
      `,
      errors: [
        {
          messageId: 'enforceEarlyDestructuring',
          data: {
            fields: 'data',
          },
        },
      ],
      output: `
        const MyComponent = () => {
          const response = fetchData();
          const { data } = response || {};
          
          useEffect(() => {
            if (!data) return;
            processData(data);
          }, [data]);
        };
      `,
    },
    // Destructuring inside useCallback
    {
      code: `
        const MyComponent = () => {
          const user = getUser();

          const handleClick = useCallback(() => {
            const { name, age } = user;
            console.log(name, age);
          }, [user]);
        };
      `,
      errors: [
        {
          messageId: 'enforceEarlyDestructuring',
          data: {
            fields: 'name, age',
          },
        },
      ],
      output: `
        const MyComponent = () => {
          const user = getUser();
          const { name, age } = user;

          const handleClick = useCallback(() => {
            console.log(name, age);
          }, [name, age]);
        };
      `,
    },
    // Destructuring inside useMemo
    {
      code: `
        const MyComponent = () => {
          const theme = useTheme();

          const styles = useMemo(() => {
            const { colors, spacing } = theme;
            return {
              container: {
                backgroundColor: colors.background,
                padding: spacing.medium,
              },
            };
          }, [theme]);
        };
      `,
      errors: [
        {
          messageId: 'enforceEarlyDestructuring',
          data: {
            fields: 'colors, spacing',
          },
        },
      ],
      output: `
        const MyComponent = () => {
          const theme = useTheme();
          const { colors, spacing } = theme;
          
          const styles = useMemo(() => {
            return {
              container: {
                backgroundColor: colors.background,
                padding: spacing.medium,
              },
            };
          }, [colors, spacing]);
        };
      `,
    },
    // Multiple destructuring of the same object
    {
      code: `
        const MyComponent = () => {
          const user = getUser();

          useEffect(() => {
            const { name } = user;
            console.log(name);

            if (condition) {
              const { age } = user;
              console.log(age);
            }
          }, [user]);
        };
      `,
      errors: [
        {
          messageId: 'enforceEarlyDestructuring',
          data: {
            fields: 'name, age',
          },
        },
      ],
      output: `
        const MyComponent = () => {
          const user = getUser();
          const { name, age } = user;
          
          useEffect(() => {
            console.log(name);

            if (condition) {
              console.log(age);
            }
          }, [name, age]);
        };
      `,
    },
    // Destructuring with property access
    {
      code: `
        const MyComponent = () => {
          const theme = useTheme();

          const backgroundColor = useMemo(() => {
            const { palette } = theme;
            if (type === 'deleted') {
              return palette.background.elevation[4];
            }
            if (isMine) {
              return palette.primary.dark;
            }
            return palette.background.elevation[10];
          }, [isMine, theme, type]);
        };
      `,
      errors: [
        {
          messageId: 'enforceEarlyDestructuring',
          data: {
            fields: 'palette',
          },
        },
      ],
      output: `
        const MyComponent = () => {
          const theme = useTheme();
          const { palette } = theme;

          const backgroundColor = useMemo(() => {
            if (type === 'deleted') {
              return palette.background.elevation[4];
            }
            if (isMine) {
              return palette.primary.dark;
            }
            return palette.background.elevation[10];
          }, [isMine, palette, type]);
        };
      `,
    },

  ],
});
