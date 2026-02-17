import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChangeLog } from './change-log';
import { LOG_FILE, modifyHeartbeat } from './change-log';

// Claude Code PostToolUse input format
export type Input = {
  readonly session_id: string;
  readonly tool_use_id?: string;
  readonly tool_name?: string;
  readonly tool_input?: {
    readonly file_path?: string;
    readonly [key: string]: unknown;
  };
  readonly cwd?: string;
  readonly [key: string]: unknown;
};

function readInput() {
  try {
    // Support large payloads via temp file (avoids E2BIG on argv)
    const jsonInputFile = process.env.JSON_INPUT_FILE;
    if (jsonInputFile) {
      return JSON.parse(readFileSync(jsonInputFile, 'utf-8'));
    }
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
  // Claude Code PostToolUse: session_id is top-level, file_path is nested in tool_input
  const session_id = input.session_id;
  const tool_use_id = input.tool_use_id;
  const file_path = input.tool_input?.file_path;

  if (!session_id || !tool_use_id || !file_path) {
    return;
  }

  // Skip tracking files in .claude/tmp/ directory
  if (file_path.includes('.claude/tmp/')) {
    return;
  }

  // Update heartbeat
  try {
    modifyHeartbeat(session_id);
  } catch (error) {
    // Ignore errors, don't block file saving
    console.error('Failed to update heartbeat:', {
      error,
      conversationId: session_id,
      generationId: tool_use_id,
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

  const conversationIdKey = session_id;
  const generationIdKey = tool_use_id;

  ensureLogStructure(log, {
    conversationIdKey,
    generationIdKey,
  });

  // Use `as ChangeLog` to access structured entry
  const conversationEntry = (log as ChangeLog)[conversationIdKey];
  if (conversationEntry) {
    // Extract to local variable so TypeScript can narrow via Array.isArray
    const fileListOrMeta = conversationEntry[generationIdKey];
    if (Array.isArray(fileListOrMeta) && !fileListOrMeta.includes(file_path)) {
      (fileListOrMeta as string[]).push(file_path);
      writeFileSync(logPath, JSON.stringify(log, null, 2));
    }
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
