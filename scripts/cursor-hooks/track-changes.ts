import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { modifyHeartbeat } from './change-log';

/** Redefine to avoid complex dependencies */
const LOG_FILE_PATH = join(
  process.cwd(),
  '.cursor/tmp/hooks/agent-change-log.json',
);

export type Input = {
  readonly file_path: string;
  readonly conversation_id?: string;
  readonly generation_id?: string;
  readonly [key: string]: unknown;
};

export type ChangeLog = {
  readonly [conversationId: string]: {
    readonly [generationId: string]: readonly string[];
  };
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
  log: any,
  {
    conversationIdKey,
    generationIdKey,
  }: { conversationIdKey: string; generationIdKey: string },
) {
  if (!log[conversationIdKey]) {
    log[conversationIdKey] = {};
  }
  if (!log[conversationIdKey][generationIdKey]) {
    log[conversationIdKey][generationIdKey] = [];
  }
}

export function trackChanges(input: Input, logPath: string = LOG_FILE_PATH) {
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
    console.error('Failed to update heartbeat:', error);
  }

  if (!existsSync(file_path)) {
    return;
  }

  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let log: any = {};
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
    conversationIdKey: String(conversationIdKey),
    generationIdKey: String(generationIdKey),
  });

  if (!log[conversationIdKey][generationIdKey].includes(file_path)) {
    log[conversationIdKey][generationIdKey].push(file_path);
    writeFileSync(logPath, JSON.stringify(log, null, 2));
  }
}

function executeMain() {
  const input = readInput();
  if (input) {
    trackChanges(input);
  }
}

const isDirectExecution =
  process.argv[1] && process.argv[1].includes('track-changes');

if (isDirectExecution) {
  executeMain();
}
