export const AGORA_REPO: string;
export const EVENT_TYPE: string;
export function parseArgs(argv: string[]): Record<string, string>;
export function buildManifestUrl(version: string): string;
export function dispatch(args: {
  version: string;
  token?: string;
  exec?: (cmd: string, args: string[], opts: unknown) => unknown;
}): boolean;
