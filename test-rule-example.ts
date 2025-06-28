// This file demonstrates the enforce-console-error rule

import { useCallback } from 'react';
import { useAlertDialog } from '../useAlertDialog';

// ❌ BAD: Missing console.error for error severity
export const useBadErrorDialog = () => {
  const { open } = useAlertDialog('ERROR_DIALOG');

  const openErrorDialog = useCallback(() => {
    open({
      title: 'Error Occurred',
      description: 'An error occurred. Please try again.',
      severity: 'error', // This should trigger the rule
    });
  }, [open]);

  return { openErrorDialog };
};

// ✅ GOOD: Has console.error for error severity
export const useGoodErrorDialog = () => {
  const { open } = useAlertDialog('ERROR_DIALOG');

  const openErrorDialog = useCallback(() => {
    console.error('Error dialog shown to user: An error occurred.');
    open({
      title: 'Error Occurred',
      description: 'An error occurred. Please try again.',
      severity: 'error',
    });
  }, [open]);

  return { openErrorDialog };
};

// ✅ GOOD: Info severity doesn't require console logging
export const useInfoDialog = () => {
  const { open } = useAlertDialog('INFO_DIALOG');

  const openInfoDialog = useCallback(() => {
    open({
      title: 'Information',
      description: 'This is just information.',
      severity: 'info',
    });
  }, [open]);

  return { openInfoDialog };
};
