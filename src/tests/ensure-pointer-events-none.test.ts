import { ruleTesterTs } from '../utils/ruleTester';
import { ensurePointerEventsNone } from '../rules/ensure-pointer-events-none';

const pointerEventsError = (selector = '::before') => ({
  messageId: 'missingPointerEventsNone' as const,
  data: { selector },
});

ruleTesterTs.run('ensure-pointer-events-none', ensurePointerEventsNone, {
  valid: [
    // Valid case: hit-slop touch-target extension — negative offsets only EXTEND
    // beyond the origin element's box; pointer events on a pseudo-element are
    // attributed to the origin element, so it cannot block the control
    `
      const buttonStyles = {
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-6px',
          bottom: '-6px',
          left: 0,
          right: 0,
        },
      };
    `,
    // Valid case: hit-slop with negative numeric offsets (no unit)
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -6,
          bottom: -6,
          left: 0,
          right: 0,
        },
      };
    `,
    // Valid case: hit-slop with a single negative offset present (others absent)
    `
      const style = {
        '&::after': {
          content: '""',
          position: 'absolute',
          top: '-8px',
        },
      };
    `,
    // Valid case: horizontal hit-slop — negative on left/right only
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          left: '-4px',
          right: '-4px',
        },
      };
    `,
    // Valid case: '&::after' hit-slop with negative offsets
    `
      const style = {
        '&::after': {
          content: '""',
          position: 'fixed',
          top: '-10px',
          bottom: '-10px',
          left: '-10px',
          right: '-10px',
        },
      };
    `,
    // Valid case: hit-slop mixing negative + zero + unknown non-inset props
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-6px',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
        },
      };
    `,
    // Valid case: pseudo-element with position: absolute and pointer-events: none
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: fixed and pointer-events: none
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: relative (not absolute/fixed)
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'relative',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: static (default)
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: auto (intentional)
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'auto' // Intentionally interactive
          }
        };
      `,
    },
    // Valid case: not a pseudo-element
    {
      code: `
        const style = {
          button: {
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: styled-components with pointer-events: none
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
        \`;
      `,
    },
    // Valid case: JSX style with pointer-events: none
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid case: pseudo-element with kebab-case pointer-events property
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            'pointer-events': 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position set via variable but not absolute/fixed
    {
      code: `
        const positionType = 'relative';
        const style = {
          '&::before': {
            content: '""',
            position: positionType,
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute but in a non-style object
    {
      code: `
        const config = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: emotion css with pointer-events: none
    {
      code: `
        const styles = css({
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        });
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: inherit
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'inherit'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events set to a variable
    {
      code: `
        const pointerEventsValue = 'none';
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: pointerEventsValue
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute in a nested structure
    {
      code: `
        const styles = {
          container: {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute in a dynamic property name
    {
      code: `
        const pseudoElement = '&::before';
        const style = {
          [pseudoElement]: {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: styled-components with no position specified (defaults to static)
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            width: 100%;
            height: 100%;
          }
        \`;
      `,
    },
    // Valid case: pseudo-element with position: absolute in a complex nested structure
    {
      code: `
        const theme = {
          components: {
            Button: {
              variants: {
                primary: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }
                }
              }
            }
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: none with comments in between
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            // This is important for accessibility
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Note: The rule doesn't detect position values from variables
    {
      code: `
        const positionType = 'absolute';
        const style = {
          '&::before': {
            content: '""',
            position: positionType,
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Note: The rule doesn't detect pseudo-elements in computed property names
    {
      code: `
        const pseudoElement = '&::before';
        const style = {
          [pseudoElement]: {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Note: The rule allows any pointer-events value, not just 'none' or 'auto'
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'all'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: none in a different order
    {
      code: `
        const style = {
          '&::before': {
            pointerEvents: 'none',
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Note: The rule doesn't support spread operators, ternary expressions, or conditional expressions
    // These would be valid in a more advanced implementation

    // Valid case: pseudo-element with position: absolute and pointer-events: none in uppercase
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'NONE'
          }
        };
      `,
    },

    // Valid case: pseudo-element with position: absolute and pointer-events: none in mixed case
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'NoNe'
          }
        };
      `,
    },

    // Valid case: pseudo-element with position: absolute and pointer-events: none with extra whitespace
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents:    'none'
          }
        };
      `,
    },
  ],
  invalid: [
    // Invalid case: pseudo-element with position: absolute but no pointer-events
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: fixed but no pointer-events
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0
          }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: styled-components without pointer-events
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
          }
        \`;
      `,
      errors: [pointerEventsError('::before')],
    },
    // Invalid case: JSX style without pointer-events
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [pointerEventsError('::before')],
      output: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }} />
        );
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a style object with 'style' in the name
    {
      code: `
        const buttonStyle = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const buttonStyle = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: emotion css without pointer-events
    {
      code: `
        const styles = css({
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        });
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = css({
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        });
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a nested structure
    {
      code: `
        const styles = {
          container: {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = {
          container: {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a complex nested structure
    {
      code: `
        const theme = {
          components: {
            Button: {
              variants: {
                primary: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%'
                  }
                }
              }
            }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const theme = {
          components: {
            Button: {
              variants: {
                primary: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%', pointerEvents: 'none'
                  }
                }
              }
            }
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute and empty object
    {
      code: `
        const style = {
          '&::before': {
            position: 'absolute',
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            position: 'absolute', pointerEvents: 'none',
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a style object with multiple properties
    {
      code: `
        const styles = {
          container: { display: 'flex' },
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          },
          '&:hover': { color: 'red' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = {
          container: { display: 'flex' },
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          },
          '&:hover': { color: 'red' }
        };
      `,
    },
    // Invalid case: pseudo-element with both ::before and ::after in styled-components
    {
      code: `
        const Button = styled.button\`
          &::before, &::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
          }
        \`;
      `,
      errors: [pointerEventsError('::before')],
    },
    // Invalid case: pseudo-element with old single-colon syntax
    {
      code: `
        const style = {
          '&:before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&:before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a JSX spread attribute
    {
      code: `
        const pseudoStyles = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
        const Component = () => (
          <div style={{...pseudoStyles}} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [pointerEventsError('::before')],
      output: `
        const pseudoStyles = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
        const Component = () => (
          <div style={{...pseudoStyles}} />
        );
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a deeply nested object
    {
      code: `
        const styles = {
          level1: {
            level2: {
              level3: {
                level4: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%'
                  }
                }
              }
            }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = {
          level1: {
            level2: {
              level3: {
                level4: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%', pointerEvents: 'none'
                  }
                }
              }
            }
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in an array of styles
    {
      code: `
        const styleArray = [
          {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }
        ];
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styleArray = [
          {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }
        ];
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a function that returns styles
    {
      code: `
        function getStyles() {
          return {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          };
        }
      `,
      errors: [pointerEventsError('::before')],
      output: `
        function getStyles() {
          return {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          };
        }
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a style with comments
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute', // This is absolute positioning
            width: '100%', // Full width
            height: '100%' // Full height
            // Missing pointer-events: none
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute', // This is absolute positioning
            width: '100%', // Full width
            height: '100%', pointerEvents: 'none' // Full height
            // Missing pointer-events: none
          }
        };
      `,
    },

    // Note: The rule doesn't detect pseudo-elements in template literals outside of styled-components
    // This would be an invalid case in a more advanced implementation

    // Invalid case: pseudo-element with position: absolute in a style with unusual formatting
    {
      code: `
        const style={
          '&::before':{
            content:'""',position:'absolute',
            width:'100%',height:'100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style={
          '&::before':{
            content:'""',position:'absolute',
            width:'100%',height:'100%', pointerEvents: 'none'
          }
        };
      `,
    },

    // Note: The rule doesn't detect position values with different casing
    // These would be invalid cases in a more advanced implementation

    // Invalid case: full-cover overlay — all inset offsets zero (no negative),
    // so it is not a hit-slop extension and must still be flagged
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: positive-offset overlay — a positive inset is not hit-slop
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '10px',
            left: 0
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '10px',
            left: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: mixed offsets — one negative but one positive, so it is not
    // a pure hit-slop extension and must still be flagged
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-6px',
            bottom: '10px'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-6px',
            bottom: '10px', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: absolute overlay sized to cover with no inset offsets at all
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
  ],
});
