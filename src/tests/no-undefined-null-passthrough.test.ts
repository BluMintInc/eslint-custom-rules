import { noUndefinedNullPassthrough } from '../rules/no-undefined-null-passthrough';
import { ruleTesterTs } from '../utils/ruleTester';

const error = (paramName: string) => ({
  messageId: 'unexpected' as const,
  data: { paramName },
});

ruleTesterTs.run('no-undefined-null-passthrough', noUndefinedNullPassthrough, {
  valid: [
    // Functions that do something with null/undefined other than returning it
    `function processData(data) {
      if (!data) return [];
      return data.items;
    }`,

    // Functions that don't have early returns for null/undefined
    `function processData(data) {
      const result = data?.items || [];
      return result;
    }`,

    // React hooks are exempt from this rule
    `function useData(data) {
      if (!data) return;
      return data.value;
    }`,

    `const useFeatureFlag = (flagName) => {
      if (!flagName) return undefined;
      return useContext(FeatureFlagContext)[flagName];
    }`,

    // Functions that handle null/undefined in a different way
    `function getFirstItem(items) {
      return items?.[0];
    }`,

    // Functions that don't directly return the parameter
    `function processData(data) {
      if (!data) return null;
      return transformData(data);
    }`,

    // Functions with multiple parameters that don't have early returns
    `function processMultipleParams(data, options) {
      return data?.process(options);
    }`,

    `const processMultipleParams = (data, options) => {
      return data?.process(options);
    }`,

    // Additional valid cases for comprehensive testing

    // Functions with no parameters
    `function getData() {
      return null;
    }`,

    // Functions that return different values for null/undefined
    `function processData(data) {
      if (!data) return 'default';
      return data.items;
    }`,

    // Functions that return empty arrays instead of null/undefined
    `function processData(data) {
      if (!data) return [];
      return data.items;
    }`,

    // Functions that return empty objects
    `function processData(data) {
      if (!data) return {};
      return data.items;
    }`,

    // Functions that return zero or false
    `function processData(data) {
      if (!data) return 0;
      return data.count;
    }`,

    `function processData(data) {
      if (!data) return false;
      return data.isValid;
    }`,

    // Functions with transformations using external functions
    `function processData(data) {
      if (!data) return null;
      return transformData(data);
    }`,

    `function processData(data) {
      if (!data) return;
      return processExternally(data);
    }`,

    // Functions with Object.* transformations
    `function processData(data) {
      if (!data) return;
      return Object.keys(data);
    }`,

    `function processData(data) {
      if (!data) return;
      return Object.values(data);
    }`,

    // Functions that use optional chaining
    `function processData(data) {
      return data?.items?.length || 0;
    }`,

    // Functions that use nullish coalescing
    `function processData(data) {
      return data ?? 'default';
    }`,

    // Functions with try-catch blocks that do real work
    `function processData(data) {
      if (!data) return [];
      try {
        return data.process();
      } catch (e) {
        return [];
      }
    }`,

    // Functions with complex logic that don't just pass through
    `function processData(data) {
      if (!data) return [];
      const result = [];
      for (const item of data) {
        result.push(item.value);
      }
      return result;
    }`,

    // Functions with multiple early returns but different values
    `function processData(data, type) {
      if (!data) return 'no-data';
      if (!type) return 'no-type';
      return data.filter(item => item.type === type);
    }`,

    // Functions that check for specific properties
    `function processData(data) {
      if (!data || !data.items) return [];
      return data.items;
    }`,

    // Functions with destructuring that don't return null/undefined
    `function processUser({ id, name }) {
      if (!id) return { error: 'No ID' };
      return { id, name: name.toUpperCase() };
    }`,

    // Functions with default parameters that work correctly
    `function processData(data = []) {
      return data.filter(item => item.active);
    }`,

    // Functions that handle arrays properly
    `function processData(data) {
      if (!Array.isArray(data)) return [];
      return data.map(item => item.value);
    }`,

    // Functions with early returns that don't check parameters
    `function processData(data) {
      if (Math.random() > 0.5) return 'random';
      return data.items;
    }`,

    // Functions that check parameter properties instead of the parameter itself
    `function processData(data) {
      if (!data.items) return [];
      return data.items;
    }`,

    // Functions with complex conditions not related to null/undefined
    `function processData(data, threshold) {
      if (data.length < threshold) return [];
      return data.filter(item => item.value > threshold);
    }`,

    // Functions that use the parameter in the condition but not for null/undefined
    `function processData(data) {
      if (data.length === 0) return 'empty';
      return data.items;
    }`,

    // Arrow functions with complex expressions
    `const processData = (data) => data?.items?.map(item => item.value) || []`,

    // Functions that throw errors instead of returning null/undefined
    `function processData(data) {
      if (!data) throw new Error('Data required');
      return data.items;
    }`,

    // Functions with side effects
    `function processData(data) {
      if (!data) {
        console.log('No data provided');
        return [];
      }
      return data.items;
    }`,

    // Functions that modify the parameter
    `function processData(data) {
      if (!data) return [];
      data.processed = true;
      return data;
    }`,

    // Functions with async/await that don't just pass through
    `async function processData(data) {
      if (!data) return [];
      const result = await fetchAdditionalData(data.id);
      return { ...data, ...result };
    }`,

    // Generator functions that don't just pass through
    `function* processData(data) {
      if (!data) return;
      for (const item of data) {
        yield transformItem(item);
      }
    }`,

    // Functions with multiple parameters where the check is more complex
    `function processData(data, options, callback) {
      if (!data || !callback) return null;
      return callback(data, options);
    }`,

    // Functions that use rest parameters
    `function processData(data, ...args) {
      if (!data) return [];
      return processWithArgs(data, ...args);
    }`,

    // Functions with spread operator
    `function processData(data) {
      if (!data) return {};
      return { ...data, processed: true };
    }`,

    // Functions with unknown parameters are exempt from this rule
    `export function extractUserFriendlyMessage(error: unknown) {
      if (typeof error !== 'object' || error === null) {
        return;
      }
      return (error as any).message;
    }`,

    `export const processUnknown = (input: unknown) => {
      if (!input) return undefined;
      return String(input);
    };`,

    `function multiParamUnknown(a: string, b: unknown) {
      if (!b) return;
      return a + String(b);
    }`,

    // The bare-identifier passthrough is deliberately withheld from the
    // block-bodied path. Its boundary is unsettled — inline callback arguments
    // such as `items.filter((x) => x)` reach the same shape without the
    // prescribed remedy applying — so the implicit-return spelling's treatment
    // of it is intentionally NOT mirrored here. Whatever carve-out settles that
    // question should land on both spellings at once rather than being fixed
    // twice.
    `const identity = (value) => { return value; };`,

    `function identity(value) {
      return value;
    }`,

    `const passThrough = function (payload = null) {
      return payload;
    };`,

    // Only a SOLE return statement is in scope: a block that does other work
    // before returning is not the same claim as an implicit return.
    `const getData = (data) => {
      logAccess(data);
      return data && data.value;
    };`,

    `const getName = (user) => {
      const trimmed = user;
      return user ? user.name : null;
    };`,

    // The returned expression must be keyed on the parameter itself.
    `const getData = (data) => {
      return other && other.value;
    };`,

    `const getName = (user) => {
      return account ? account.name : null;
    };`,

    // A ternary whose alternate is a concrete fallback provides a meaningful
    // result, so it is not a passthrough.
    `const getName = (user) => {
      return user ? user.name : 'anonymous';
    };`,

    // `||` hands back the right operand rather than the nullish parameter.
    `const getData = (data) => {
      return data || getFallback();
    };`,

    // A block returning nothing has no expression to classify.
    `const getData = (data) => {
      return;
    };`,

    // An empty block has no sole statement at all.
    `const getData = (data) => {};`,

    `function getData(data) {}`,

    // React hooks stay exempt regardless of body spelling.
    `const useData = (data) => {
      return data && data.value;
    };`,

    // Unknown parameters stay exempt regardless of body spelling.
    `const narrow = (input: unknown) => {
      return input ? String(input) : null;
    };`,
  ],
  invalid: [
    // Function declaration with early return for null/undefined
    {
      code: `function extractAudioTrack(audioTrackPublications) {
        if (!audioTrackPublications) {
          return;
        }
        const localTrackPublication = audioTrackPublications.values().next().value;
        return localTrackPublication?.audioTrack;
      }`,
      errors: [error('audioTrackPublications')],
    },

    // Arrow function with early return for null/undefined
    {
      code: `const extractAudioTrack = (audioTrackPublications) => {
        if (!audioTrackPublications) {
          return;
        }
        const localTrackPublication = audioTrackPublications.values().next().value;
        return localTrackPublication?.audioTrack;
      }`,
      errors: [error('audioTrackPublications')],
    },

    // Function expression with early return for null/undefined
    {
      code: `const extractAudioTrack = function(audioTrackPublications) {
        if (!audioTrackPublications) {
          return;
        }
        const localTrackPublication = audioTrackPublications.values().next().value;
        return localTrackPublication?.audioTrack;
      }`,
      errors: [error('audioTrackPublications')],
    },

    // Early return with null
    {
      code: `function processData(data) {
        if (!data) return null;
        return data.process();
      }`,
      errors: [error('data')],
    },

    // Explicit null/undefined check
    {
      code: `function processData(data) {
        if (data === null || data === undefined) {
          return;
        }
        return data.process();
      }`,
      errors: [error('data')],
    },

    // Arrow function with implicit return using logical operators
    {
      code: `const getData = (data) => data && data.value`,
      errors: [error('data')],
    },

    // Arrow function with conditional expression
    {
      code: `const getData = (data) => data ? data.value : null`,
      errors: [error('data')],
    },

    // A bare-identifier body is the only shape reaching the identity branch;
    // every other implicit-return fixture here has a conditional or logical
    // body and is answered before it.
    {
      code: `const identity = (value) => value;`,
      errors: [error('value')],
    },
    {
      code: `const passThrough = (payload = null) => payload;`,
      errors: [error('payload')],
    },

    // Function with multiple parameters and early return
    {
      code: `function processData(data, options) {
        if (!data) return;
        return data.process(options);
      }`,
      errors: [error('data')],
    },

    // Arrow function with multiple parameters and early return
    {
      code: `const processItems = (items, filter) => {
        if (!items) return;
        return items.filter(filter);
      }`,
      errors: [error('items')],
    },

    // Additional edge cases for comprehensive testing

    // Function with optional parameter (deriveRounds case)
    {
      code: `export const deriveRounds = (
        type: CohortRoundVariant,
        rounds?: Record<string, RoundCohort>,
      ) => {
        if (!rounds) {
          return; // This implicitly returns undefined
        }
        return Object.entries(rounds)
          .reduce<RoundCohort[]>((acc, [key, round]) => {
            if (decideRoundVariant(key) === type) {
              acc.push(round);
            }
            return acc;
          }, [])
          .sort((a, b) => {
            return sortCohortRounds({
              aIndex: a.roundIndex,
              bIndex: b.roundIndex,
            });
          });
      };`,
      errors: [error('rounds')],
    },

    // Function with default parameter
    {
      code: `function processData(data = null) {
        if (!data) return;
        return data.value;
      }`,
      errors: [error('data')],
    },

    // Function with multiple null checks
    {
      code: `function processData(data, options) {
        if (data === null) return;
        if (options === undefined) return;
        return data.process(options);
      }`,
      errors: [error('data')],
    },

    // Function with strict equality checks
    {
      code: `function processData(data) {
        if (data === null) return null;
        return data.items;
      }`,
      errors: [error('data')],
    },

    // Function with loose equality checks
    {
      code: `function processData(data) {
        if (data == null) return;
        return data.items;
      }`,
      errors: [error('data')],
    },

    // Arrow function with expression body returning parameter directly
    {
      code: `const getId = (user) => user && user.id`,
      errors: [error('user')],
    },

    // Arrow function with ternary returning null
    {
      code: `const getName = (user) => user ? user.name : null`,
      errors: [error('user')],
    },

    // Arrow function with ternary returning undefined
    {
      code: `const getName = (user) => user ? user.name : undefined`,
      errors: [error('user')],
    },

    // Function with multiple parameters where second parameter is checked
    {
      code: `function processData(type, data) {
        if (!data) return;
        return data.filter(item => item.type === type);
      }`,
      errors: [error('data')],
    },

    // Function with three parameters
    {
      code: `function processData(a, b, c) {
        if (!b) return;
        return b.process(a, c);
      }`,
      errors: [error('b')],
    },

    // Function expression assigned to variable
    {
      code: `const processData = function(data) {
        if (!data) return null;
        return data.items;
      }`,
      errors: [error('data')],
    },

    // Method in object literal
    {
      code: `const obj = {
        processData(data) {
          if (!data) return;
          return data.items;
        }
      }`,
      errors: [error('data')],
    },

    // Method in class
    {
      code: `class DataProcessor {
        processData(data) {
          if (!data) return;
          return data.items;
        }
      }`,
      errors: [error('data')],
    },

    // Static method in class
    {
      code: `class DataProcessor {
        static processData(data) {
          if (!data) return;
          return data.items;
        }
      }`,
      errors: [error('data')],
    },

    // Async function
    {
      code: `async function processData(data) {
        if (!data) return;
        return await data.process();
      }`,
      errors: [error('data')],
    },

    // Generator function
    {
      code: `function* processData(data) {
        if (!data) return;
        yield data.value;
      }`,
      errors: [error('data')],
    },

    // Function with complex boolean logic
    {
      code: `function processData(data, options) {
        if (!data || !options) return;
        return data.process(options);
      }`,
      errors: [error('data')],
    },

    // A block whose sole statement is `return <expr>;` states exactly what the
    // implicit-return spelling of the same expression states, so the logical
    // and conditional passthrough shapes report in either spelling.
    {
      code: `const getData = (data) => { return data && data.value; };`,
      errors: [error('data')],
    },
    {
      code: `const getData2 = (data) => { return data ? data.value : null; };`,
      errors: [error('data')],
    },
    {
      code: `const getUser = (user) => { return user ? user.name : undefined; };`,
      errors: [error('user')],
    },
    {
      code: `const getId = (user) => {
        return user && user.id;
      };`,
      errors: [error('user')],
    },

    // The block spelling is not specific to arrows.
    {
      code: `function getData(data) {
        return data && data.value;
      }`,
      errors: [error('data')],
    },
    {
      code: `const getName = function (user) {
        return user ? user.name : null;
      };`,
      errors: [error('user')],
    },
    {
      code: `class DataProcessor {
        getValue(data) {
          return data && data.value;
        }
      }`,
      errors: [error('data')],
    },

    // Default parameters resolve to the same name in either spelling.
    {
      code: `const getData = (data = null) => {
        return data && data.value;
      };`,
      errors: [error('data')],
    },

    // Async and awaited bodies carry the same passthrough.
    {
      code: `const getData = async (data) => {
        return data ? data.value : null;
      };`,
      errors: [error('data')],
    },

    // A chained right-hand side does not change what the nullish parameter
    // yields to the caller.
    {
      code: `const getData = (data) => {
        return data && data.items.map((item) => item.value);
      };`,
      errors: [error('data')],
    },
  ],
});
