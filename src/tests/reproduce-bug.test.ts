import { ruleTesterJsx } from '../utils/ruleTester';
import { noEntireObjectHookDeps } from '../rules/no-entire-object-hook-deps';

ruleTesterJsx.run('no-entire-object-hook-deps-bug-reproduction', noEntireObjectHookDeps, {
  valid: [],
  invalid: [
    // Test case for the bug report example
    {
      code: `
        const backgroundColor = useMemo(() => {
          if (type === 'deleted') {
            return theme.palette.background.elevation[4];
          }
          if (isMine) {
            return theme.palette.primary.dark;
          }
          return theme.palette.background.elevation[10];
        }, [isMine, theme, type]);
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'theme',
            fields: 'theme.palette.background.elevation[4], theme.palette.primary.dark, theme.palette.background.elevation[10]',
          },
        },
      ],
      output: `
        const backgroundColor = useMemo(() => {
          if (type === 'deleted') {
            return theme.palette.background.elevation[4];
          }
          if (isMine) {
            return theme.palette.primary.dark;
          }
          return theme.palette.background.elevation[10];
        }, [isMine,
   theme.palette.background.elevation[4], theme.palette.primary.dark, theme.palette.background.elevation[10], type]);
      `,
    },
  ],
});
