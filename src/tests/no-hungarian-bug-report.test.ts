import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian-bug-report', noHungarian, {
  valid: [
    // This should be valid but is currently being flagged as a false positive
    `
    export const BREAKPOINTS = {
      values: {
        xs: 0,
        sm: 600,
        md: 900,
        lg: 1200,
        xl: 1500,
        xxl: 1800,
      },
    } as const;

    export const GOOGLE_RECAPTCHA_ZINDEX = 2000000000 as const;

    export const ZINDEX = {
      mobileStepper: 1000,
      speedDial: 1050,
      appBar: 1600,
      drawer: 1100,
      modal: GOOGLE_RECAPTCHA_ZINDEX - 10,
      dialog: GOOGLE_RECAPTCHA_ZINDEX - 10,
      snackbar: 1400,
      tooltip: GOOGLE_RECAPTCHA_ZINDEX - 5,
      glider: 800,
      menu: 2000,
      voiceChat: 1,
      messageInput: 2,
      replyBackdrop: 9,
      messageInputReply: 10,
    } as const;

    export type ZIndex = typeof ZINDEX;
    `,
  ],
  invalid: [],
});
