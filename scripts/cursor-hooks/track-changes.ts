import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChangeLog } from './change-log';
import { LOG_FILE, modifyHeartbeat } from './change-log';

export type Input = {
  readonly file_path: string;
  readonly conversation_id?: string;
  readonly generation_id?: string;
  readonly [key: string]: unknown;
};

function readInput() {
  try {
    if (process.stdin.isTTY) {
      return null;
    }
    const input = readFileSync(0, 'utf-8');
    if (!input) return null;
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function ensureLogStructure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: any,
  {
    conversationIdKey,
    generationIdKey,
  }: { conversationIdKey: string; generationIdKey: string },
) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!log[conversationIdKey]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    log[conversationIdKey] = {};
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!log[conversationIdKey][generationIdKey]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    log[conversationIdKey][generationIdKey] = [];
  }
}

export function trackChanges(input: Input, logPath: string = LOG_FILE) {
  const { conversation_id, generation_id, file_path } = input;

  if (!conversation_id || !generation_id || !file_path) {
    return;
  }

  // Skip tracking files in .cursor/tmp/ directory
  if (file_path.includes('.cursor/tmp/')) {
    return;
  }

  // Update heartbeat
  try {
    modifyHeartbeat(conversation_id);
  } catch (error) {
    // Ignore errors, don't block file saving
    console.error('Failed to update heartbeat:', {
      error,
      conversationId: conversation_id,
      generationId: generation_id,
    });
  }

  if (!existsSync(file_path)) {
    return;
  }

  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let log: ChangeLog | Record<string, unknown> = {};
  if (existsSync(logPath)) {
    try {
      log = JSON.parse(readFileSync(logPath, 'utf-8'));
    } catch {
      log = {};
    }
  }

  const conversationIdKey = conversation_id;
  const generationIdKey = generation_id;

  ensureLogStructure(log, {
    conversationIdKey,
    generationIdKey,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  // Use `as ChangeLog` to access structured entry
  const conversationEntry = (log as ChangeLog)[conversationIdKey];
  if (
    conversationEntry &&
    Array.isArray(conversationEntry[generationIdKey]) &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    !conversationEntry[generationIdKey].includes(file_path)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    (conversationEntry[generationIdKey] as string[]).push(file_path);
    writeFileSync(logPath, JSON.stringify(log, null, 2));
  }
}

function executeMain() {
  const input = readInput();
  if (input) {
    trackChanges(input);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  executeMain();
}
