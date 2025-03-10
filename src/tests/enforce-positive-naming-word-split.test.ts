import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run(
  'enforce-positive-naming (word splitting)',
  enforcePositiveNaming,
  {
    valid: [
      // Valid names with exception words
      // Words that contain 'in' but are not negative
      'const isInterested = true;',
      'const isIndustryStandard = true;',
      'const isIntelligent = true;',
      'const hasInformation = true;',
      'const hasInventory = true;',
      'const hasInterface = true;',
      'const willIntroduce = true;',
      'const shouldInvestigate = true;',
      'const doesInclude = true;',

      // Snake case variables with exception words
      'const IS_INITIAL_VALUE = true;',
      'const HAS_INTERFACE = true;',
      'const SHOULD_INITIALIZE = true;',

      // Lower camel case variables
      'const hasInitialValue = true;',
      'const isInvestmentWorth = true;',
      'const shouldInputValues = true;',

      // Names that mix positive and negative but in the right order
      'const isUserNotFound = false;', // This is okay because 'not' isn't a prefix of 'is'
      'const hasItemInInventory = true;', // 'in' is in 'inventory' but not a standalone prefix
      'const isSomethingInteresting = true;', // Contains 'inter' in the middle, not a negative prefix

      // Complex variable names with embedded exception words
      'const isInputInvalid = false;', // 'invalid' contains 'in' but it's not a prefix
      'const hasInternationalSupport = true;', // 'international' starts with 'in' but it's an exception
      'const shouldIncludeDetails = true;', // 'include' starts with 'in' but it's an exception

      // Hungarian notation tests (not actually Hungarian but just to ensure it works)
      'const bIsActive = true;', // The boolean prefix isn't at the start
      'const btnIsDisabled = true;', // Not actually a boolean variable with a boolean prefix
    ],
    invalid: [
      // Invalid names that should be correctly detected with word splitting
      {
        code: 'const isNotVerifiedUser = false;', // 'not' is a separate word prefix after 'is'
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'isNotVerifiedUser',
              alternatives: 'isVerifiedUser',
            },
          },
        ],
      },
      {
        code: 'const hasNoAvailableItems = true;',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'hasNoAvailableItems',
              alternatives: 'hasAvailableItems',
            },
          },
        ],
      },
      {
        code: 'const isUnavailableForPurchase = true;', // Since we're using word splits, this should be caught
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'isUnavailableForPurchase',
              alternatives: 'isAvailableForPurchase',
            },
          },
        ],
      },
      {
        code: 'const IS_NOT_AVAILABLE = true;', // Snake case with negative prefix
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'IS_NOT_AVAILABLE',
              alternatives: 'IS_AVAILABLE',
            },
          },
        ],
      },
      {
        code: 'const isInactive = false;', // 'in' negative prefix before 'Active'
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'isInactive',
              alternatives: 'isActive',
            },
          },
        ],
      },
      {
        code: 'const isDisconnected = false;', // 'dis' negative prefix before 'Connected'
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'isDisconnected',
              alternatives: 'isConnected',
            },
          },
        ],
      },
      // Complex word identification
      {
        code: 'function isNotWorkingProperly() { return false; }',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'isNotWorkingProperly',
              alternatives: 'isWorkingProperly',
            },
          },
        ],
      },
      {
        code: 'const shouldNotBeAllowedToEnter = true;',
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'shouldNotBeAllowedToEnter',
              alternatives: 'shouldBeAllowedToEnter',
            },
          },
        ],
      },
    ],
  },
);
