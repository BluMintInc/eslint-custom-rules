import { ruleTesterTs } from '../utils/ruleTester';
import { enforceEmptyObjectCheck } from '../rules/enforce-empty-object-check';

ruleTesterTs.run('enforce-empty-object-check', enforceEmptyObjectCheck, {
  valid: [
    // Already correct patterns - should not be flagged
    {
      code: 'if (!userConfig || Object.keys(userConfig).length === 0) { useDefault(); }',
      filename: 'test.ts',
    },
    {
      code: 'if (!apiData || Object.keys(apiData).length === 0) { return null; }',
      filename: 'test.ts',
    },
    {
      code: 'const isEmpty = !settings || Object.keys(settings).length === 0;',
      filename: 'test.ts',
    },

    // Non-object-like variable names - should not be flagged
    {
      code: 'if (!isEnabled) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!hasAccess) { throw new Error(); }',
      filename: 'test.ts',
    },
    {
      code: 'if (!canEdit) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!shouldUpdate) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!count) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!index) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!length) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!callback) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!handler) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!items) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!list) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!array) { return; }',
      filename: 'test.ts',
    },

    // Default value patterns - should not be flagged
    {
      code: 'const result = !userConfig ? defaultConfig : userConfig;',
      filename: 'test.ts',
    },
    {
      code: 'const data = !apiResponse || fallbackData;',
      filename: 'test.ts',
    },
    {
      code: '!settings && loadDefaultSettings();',
      filename: 'test.ts',
    },

    // Performance-sensitive contexts (loops) - should not be flagged by default
    {
      code: `
        for (let i = 0; i < items.length; i++) {
          const itemConfig = items[i];
          if (!itemConfig) continue;
        }
      `,
      filename: 'test.ts',
    },
    {
      code: `
        items.forEach(item => {
          if (!item.userData) return;
        });
      `,
      filename: 'test.ts',
    },
    {
      code: `
        const results = items.map(item => {
          if (!item.config) return null;
          return processItem(item);
        });
      `,
      filename: 'test.ts',
    },

    // Complex logical expressions that already handle empty objects
    {
      code: 'if (userConfig && Object.keys(userConfig).length > 0) { process(); }',
      filename: 'test.ts',
    },

    // Non-identifier arguments - should not be flagged
    {
      code: 'if (!getValue()) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!(x + y)) { return; }',
      filename: 'test.ts',
    },

    // Variables that don't match object-like patterns
    {
      code: 'if (!value) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!result) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!status) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!type) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!id) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!name) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!message) { return; }',
      filename: 'test.ts',
    },

    // Member expressions with non-object-like property names
    {
      code: 'if (!user.isActive) { return; }',
      filename: 'test.ts',
    },
    {
      code: 'if (!user.hasAccess) { return; }',
      filename: 'test.ts',
    },
  ],

  invalid: [
    // Object-like variable names with Config suffix
    {
      code: 'if (!userConfig) { useDefault(); }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userConfig || Object.keys(userConfig).length === 0) { useDefault(); }',
    },
    {
      code: 'if (!apiConfig) { return null; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!apiConfig || Object.keys(apiConfig).length === 0) { return null; }',
    },
    {
      code: 'if (!appConfig) { loadDefaults(); }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!appConfig || Object.keys(appConfig).length === 0) { loadDefaults(); }',
    },

    // Object-like variable names with Data suffix
    {
      code: 'if (!userData) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userData || Object.keys(userData).length === 0) { return; }',
    },
    {
      code: 'if (!apiData) { throw new Error(); }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!apiData || Object.keys(apiData).length === 0) { throw new Error(); }',
    },
    {
      code: 'if (!formData) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!formData || Object.keys(formData).length === 0) { return; }',
    },

    // Object-like variable names with other suffixes
    {
      code: 'if (!userInfo) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userInfo || Object.keys(userInfo).length === 0) { return; }',
    },
    {
      code: 'if (!appSettings) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!appSettings || Object.keys(appSettings).length === 0) { return; }',
    },
    {
      code: 'if (!componentProps) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!componentProps || Object.keys(componentProps).length === 0) { return; }',
    },
    {
      code: 'if (!pageState) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!pageState || Object.keys(pageState).length === 0) { return; }',
    },
    {
      code: 'if (!routeParams) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!routeParams || Object.keys(routeParams).length === 0) { return; }',
    },

    // Object-like variable names with pattern prefixes
    {
      code: 'if (!userProfile) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userProfile || Object.keys(userProfile).length === 0) { return; }',
    },
    {
      code: 'if (!apiResponse) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!apiResponse || Object.keys(apiResponse).length === 0) { return; }',
    },
    {
      code: 'if (!appState) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!appState || Object.keys(appState).length === 0) { return; }',
    },
    {
      code: 'if (!formValidation) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!formValidation || Object.keys(formValidation).length === 0) { return; }',
    },
    {
      code: 'if (!pageMetadata) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!pageMetadata || Object.keys(pageMetadata).length === 0) { return; }',
    },

    // More object-like suffixes
    {
      code: 'if (!requestPayload) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!requestPayload || Object.keys(requestPayload).length === 0) { return; }',
    },
    {
      code: 'if (!responseData) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!responseData || Object.keys(responseData).length === 0) { return; }',
    },
    {
      code: 'if (!sessionInfo) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!sessionInfo || Object.keys(sessionInfo).length === 0) { return; }',
    },
    {
      code: 'if (!authData) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!authData || Object.keys(authData).length === 0) { return; }',
    },
    {
      code: 'if (!themeConfig) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!themeConfig || Object.keys(themeConfig).length === 0) { return; }',
    },

    // Member expressions with object-like property names
    {
      code: 'if (!user.config) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!user.config || Object.keys(user.config).length === 0) { return; }',
    },
    {
      code: 'if (!response.data) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!response.data || Object.keys(response.data).length === 0) { return; }',
    },
    {
      code: 'if (!component.props) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!component.props || Object.keys(component.props).length === 0) { return; }',
    },

    // Variable declarations
    {
      code: 'const isEmpty = !userConfig;',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'const isEmpty = !userConfig || Object.keys(userConfig).length === 0;',
    },
    {
      code: 'const shouldUseDefault = !appSettings;',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'const shouldUseDefault = !appSettings || Object.keys(appSettings).length === 0;',
    },

    // Function returns
    {
      code: 'return !userData;',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output: 'return !userData || Object.keys(userData).length === 0;',
    },
    {
      code: 'return !componentState;',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'return !componentState || Object.keys(componentState).length === 0;',
    },

    // Function calls with object-like arguments
    {
      code: 'processData(!userConfig);',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'processData(!userConfig || Object.keys(userConfig).length === 0);',
    },
    {
      code: 'validate(!formData);',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output: 'validate(!formData || Object.keys(formData).length === 0);',
    },

    // Complex expressions
    {
      code: 'if (!userConfig && someOtherCondition) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if ((!userConfig || Object.keys(userConfig).length === 0) && someOtherCondition) { return; }',
    },

    // Additional object-like suffixes
    {
      code: 'if (!dataModel) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!dataModel || Object.keys(dataModel).length === 0) { return; }',
    },
    {
      code: 'if (!userEntity) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userEntity || Object.keys(userEntity).length === 0) { return; }',
    },
    {
      code: 'if (!configRecord) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!configRecord || Object.keys(configRecord).length === 0) { return; }',
    },
    {
      code: 'if (!apiDocument) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!apiDocument || Object.keys(apiDocument).length === 0) { return; }',
    },
    {
      code: 'if (!dataItem) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!dataItem || Object.keys(dataItem).length === 0) { return; }',
    },
    {
      code: 'if (!configObject) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!configObject || Object.keys(configObject).length === 0) { return; }',
    },
    {
      code: 'if (!dataMap) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output: 'if (!dataMap || Object.keys(dataMap).length === 0) { return; }',
    },
    {
      code: 'if (!configDict) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!configDict || Object.keys(configDict).length === 0) { return; }',
    },
    {
      code: 'if (!userCache) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userCache || Object.keys(userCache).length === 0) { return; }',
    },
    {
      code: 'if (!appStore) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!appStore || Object.keys(appStore).length === 0) { return; }',
    },
    {
      code: 'if (!userContext) { return; }',
      filename: 'test.ts',
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!userContext || Object.keys(userContext).length === 0) { return; }',
    },

    // Test with custom options - should flag variables ending with custom suffixes
    {
      code: 'if (!customThing) { return; }',
      filename: 'test.ts',
      options: [{ objectSuffixes: ['Thing', 'Stuff'] }],
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output:
        'if (!customThing || Object.keys(customThing).length === 0) { return; }',
    },
    {
      code: 'if (!myStuff) { return; }',
      filename: 'test.ts',
      options: [{ objectSuffixes: ['Thing', 'Stuff'] }],
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output: 'if (!myStuff || Object.keys(myStuff).length === 0) { return; }',
    },
  ],
});
