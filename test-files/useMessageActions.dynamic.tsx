// This file should be allowed to import from another dynamic file
import { useMessage } from './MessageContext.dynamic';

export const useMessageActions = () => {
  const { message } = useMessage();

  const sendMessage = () => {
    console.log(`Sending message: ${message}`);
  };

  return {
    sendMessage
  };
};
