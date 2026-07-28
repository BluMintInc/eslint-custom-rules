/**
 * Fixture for issue #1316: `styled(Box)(...)` inherits Box's entire props
 * surface plus `sx`. The zero-parameter style callback is not a component, and
 * the outer callee is itself a call expression rather than a known HOC.
 */
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

export const StyledChild = styled(Box)(() => ({ padding: 8 }));
