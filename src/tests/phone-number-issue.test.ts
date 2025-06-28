import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian-phone-number-test', noHungarian, {
  valid: [
    // These should be valid and not trigger the rule
    `export type PhoneNumberStored = {
      country: string;
      countryDialCode: string;
      phoneNumber: string;
      phoneNumberUnformatted: string;
    };`,
    `export type PhoneNumberInput = 'phoneNumber';`,
    `const userPhoneNumber = '+1234567890';`,
    `interface PhoneNumberFormat {
      formatted: string;
      raw: string;
    }`,
    `class PhoneNumberValidator {
      validate(phoneNumber: string): boolean {
        return phoneNumber.length > 0;
      }
    }`,
  ],
  invalid: [
    // These should be invalid and trigger the rule (actual Hungarian notation)
    {
      code: `const strPhoneNumber = '+1234567890';`,
      errors: [{ messageId: 'noHungarian', data: { name: 'strPhoneNumber' } }],
    },
    {
      code: `const phoneNumberStr = '+1234567890';`,
      errors: [{ messageId: 'noHungarian', data: { name: 'phoneNumberStr' } }],
    },
  ],
});
