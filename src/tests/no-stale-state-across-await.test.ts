
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

describe('no-stale-state-across-await', () => {
  it('should be defined', () => {
    expect(noStaleStateAcrossAwait).toBeDefined();
  });
});
