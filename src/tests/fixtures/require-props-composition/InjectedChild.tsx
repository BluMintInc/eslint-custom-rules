/**
 * Fixture for issue #1316: an arbitrary HOC injects props onto the component it
 * returns, so the wrapped zero-parameter arrow does not describe the exported
 * binding's props surface.
 */
import { withTooltip } from './withTooltip';

export const InjectedChild = withTooltip(() => <div />);
