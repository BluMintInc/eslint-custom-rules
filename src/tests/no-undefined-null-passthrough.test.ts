import { noUndefinedNullPassthrough } from '../rules/no-undefined-null-passthrough';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-undefined-null-passthrough', noUndefinedNullPassthrough, {
  valid: [
    // Functions with multiple parameters are valid
    `function processData(data, options) {
      if (!data) return;
      return data.process(options);
    }`,

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

    // Arrow functions with multiple parameters
    `const processItems = (items, filter) => {
      if (!items) return;
      return items.filter(filter);
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
      errors: [{ messageId: 'unexpected' }],
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
      errors: [{ messageId: 'unexpected' }],
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
      errors: [{ messageId: 'unexpected' }],
    },

    // Early return with null
    {
      code: `function processData(data) {
        if (!data) return null;
        return data.process();
      }`,
      errors: [{ messageId: 'unexpected' }],
    },

    // Explicit null/undefined check
    {
      code: `function processData(data) {
        if (data === null || data === undefined) {
          return;
        }
        return data.process();
      }`,
      errors: [{ messageId: 'unexpected' }],
    },

    // Arrow function with implicit return using logical operators
    {
      code: `const getData = (data) => data && data.value`,
      errors: [{ messageId: 'unexpected' }],
    },

    // Arrow function with conditional expression
    {
      code: `const getData = (data) => data ? data.value : null`,
      errors: [{ messageId: 'unexpected' }],
    },
  ],
});
