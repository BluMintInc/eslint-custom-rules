import React, { forwardRef, memo } from 'react';
import { observer } from 'mobx-react-lite';

/**
 * Fixtures: zero-prop children wrapped in props-preserving HOCs. Each of these
 * wrappers hands the wrapped component's props surface straight through, so a
 * zero-parameter inner component really is prop-less and the relaxation may
 * still see through the call (issue #1316).
 */
export const MemoChild = memo(() => {
  return <div />;
});

export const ReactMemoChild = React.memo(() => {
  return <div />;
});

export const ForwardRefChild = forwardRef(() => {
  return <div />;
});

export const ReactForwardRefChild = React.forwardRef(() => {
  return <div />;
});

export const ObserverChild = observer(() => {
  return <div />;
});
