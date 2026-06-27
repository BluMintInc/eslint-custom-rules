/**
 * Timestamped console logger for the autopilot loop. Local to pr-autopilot so it
 * carries no cross-repo dependency.
 */
export const logWithTimestamp = (...args: unknown[]): void => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}]:`, ...args);
};
