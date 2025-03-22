// This is a test file to reproduce the issue with no-restricted-imports
import { useMessage } from './components/messaging/message/MessageContext.dynamic';

// The above import should be allowed in a .dynamic.tsx file
// but is being incorrectly flagged by the no-restricted-imports rule
