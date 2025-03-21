import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/enforce-nextjs-dynamic';

const ruleTester = ruleTesterTs;

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Already using Next.js dynamic
    {
      code: `
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Using dynamic with named export
    {
      code: `
import dynamic from 'next/dynamic';

const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);
      `,
    },
    // Regular imports (not using useDynamic)
    {
      code: `
import { useState } from 'react';
import EmojiPicker from '@emoji-mart/react';
      `,
    },
  ],
  invalid: [
    // Basic case: useDynamic with default import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Case with dynamic already imported
    {
      code: `
import dynamic from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Case with destructuring pattern
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { Picker } = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);
      `,
    },
    // Case with multiple destructured components
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { Picker, EmojiData } = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);

const EmojiData = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.EmojiData;
  },
  { ssr: false }
);
      `,
    },
    // Case with default import of useDynamic
    {
      code: `
import useDynamic from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
  ],
});
