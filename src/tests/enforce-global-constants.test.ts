import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceGlobalConstants } from '../rules/enforce-global-constants';

ruleTesterJsx.run('enforce-global-constants', enforceGlobalConstants, {
  valid: [
    // Global constants are valid
    `
    const ROOM_OPTIONS = { disconnectOnPageLeave: true } as const;

    const MyComponent = () => {
      return (
        <div>
          {Object.entries(ROOM_OPTIONS).map(([key, option]) => (
            <Option key={key} label={option.label} icon={option.icon} />
          ))}
        </div>
      );
    };
    `,
    // useMemo with dependencies is valid
    `
    const MyComponent = () => {
      const roomOptions = useMemo(() => {
        return {
          disconnectOnPageLeave: true,
        } as const;
      }, [someValue]);

      return (
        <div>
          {Object.entries(roomOptions).map(([key, option]) => (
            <Option key={key} label={option.label} icon={option.icon} />
          ))}
        </div>
      );
    };
    `,
    // useMemo with computationally expensive operations is valid
    `
    const MyComponent = () => {
      const expensiveComputation = useMemo(() => {
        let result = 0;
        for (let i = 0; i < 1000; i++) {
          result += someComplexCalculation(i);
        }
        return result;
      }, []);

      return <div>{expensiveComputation}</div>;
    };
    `,
  ],
  invalid: [
    // useMemo with empty dependency array returning object literal
    {
      code: `
      const MyComponent = () => {
        const roomOptions = useMemo(() => {
          return {
            disconnectOnPageLeave: true,
          } as const;
        }, []);

        return (
          <div>
            {Object.entries(roomOptions).map(([key, option]) => (
              <Option key={key} label={option.label} icon={option.icon} />
            ))}
          </div>
        );
      };
      `,
      errors: [
        {
          messageId: 'useGlobalConstant',
        },
      ],
    },
    // useMemo with empty dependency array and implicit return of object literal
    {
      code: `
      const MyComponent = () => {
        const roomOptions = useMemo(() => ({
          disconnectOnPageLeave: true,
        }), []);

        return (
          <div>
            {Object.entries(roomOptions).map(([key, option]) => (
              <Option key={key} label={option.label} icon={option.icon} />
            ))}
          </div>
        );
      };
      `,
      errors: [
        {
          messageId: 'useGlobalConstant',
        },
      ],
    },
    // useMemo with empty dependency array returning array of object literals
    {
      code: `
      const MyComponent = () => {
        const options = useMemo(() => [
          { id: 1, label: 'Option 1' },
          { id: 2, label: 'Option 2' },
        ], []);

        return (
          <div>
            {options.map(option => (
              <Option key={option.id} label={option.label} />
            ))}
          </div>
        );
      };
      `,
      errors: [
        {
          messageId: 'useGlobalConstant',
        },
      ],
    },
  ],
});
