/**
 * Fixture for issue #1316: a curried HOC (`connect(mapState)(Component)`). The
 * callee is itself a call expression, so nothing about the exported binding's
 * props surface is knowable from the wrapped zero-parameter arrow.
 */
import { connect } from 'react-redux';
import { mapState } from './mapState';

export const ConnectedChild = connect(mapState)(() => <div />);
