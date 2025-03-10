import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

// This function is exported to avoid the "unused" warning
export function writeTsFile(filePath: string, content: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}
