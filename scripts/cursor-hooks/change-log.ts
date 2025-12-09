import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const LOG_FILE = join(
  process.cwd(),
  '.cursor/tmp/hooks/agent-change-log.json',
);
export const MAX_LOOPS = 10 as const;
export const ACTIVE_THRESHOLD_MS = 10 * 60 * 1000;

export type ConversationMeta = {
  readonly hasCheckWorkPrompted?: boolean;
  readonly hasExpandTestsPrompted?: boolean;
  readonly isRuleRequest?: boolean;
  readonly lastUserMessage?: string;
  readonly endTimestamp?: number;
  readonly lastActivityTimestamp?: number;
};

export type ConversationEntry = {
  readonly _metadata?: ConversationMeta;
} & { readonly [generationId: string]: readonly string[] };

export type ChangeLog = {
  readonly [conversationId: string]: ConversationEntry;
};

export type MutableConversationMeta = {
  hasCheckWorkPrompted?: boolean;
  hasExpandTestsPrompted?: boolean;
  isRuleRequest?: boolean;
  lastUserMessage?: string;
  endTimestamp?: number;
  lastActivityTimestamp?: number;
};

export type MutableConversationEntry = {
  _metadata?: MutableConversationMeta;
} & { [generationId: string]: readonly string[] | undefined };

export type MutableChangeLog = {
  [conversationId: string]: MutableConversationEntry;
};

export function loadLogFile() {
  if (!existsSync(LOG_FILE)) return {} as const;
  try {
    const content = JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
    const log: MutableChangeLog = content;
    return log;
  } catch {
    return {} as const;
  }
}

export function saveLogFile(log: MutableChangeLog) {
  const dir = dirname(LOG_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function applyEntryModification(
  conversationId: string,
  modifier: (entry: MutableConversationEntry) => void,
) {
  const log = loadLogFile();
  const logEntry = log[conversationId] || {};
  if (!logEntry._metadata) logEntry._metadata = {};
  modifier(logEntry);
  log[conversationId] = logEntry;
  saveLogFile(log);
  return logEntry;
}

export function fetchLastUserMessage(conversationId: string) {
  const log = loadLogFile();
  return log[conversationId]?._metadata?.lastUserMessage || null;
}

export function setLastUserMessage({
  conversationId,
  message,
}: {
  readonly conversationId: string;
  readonly message: string;
}) {
  applyEntryModification(conversationId, (entry) => {
    if (entry._metadata) {
      entry._metadata.lastUserMessage = message;
      entry._metadata.lastActivityTimestamp = Date.now();
    }
  });
}

export function modifyConversationLastActive(conversationId: string) {
  applyEntryModification(conversationId, (entry) => {
    const now = Date.now();
    if (entry._metadata) {
      entry._metadata.endTimestamp = undefined;
      entry._metadata.lastActivityTimestamp = now;
    }
  });
}

export function modifyConversationEnd(conversationId: string) {
  try {
    applyEntryModification(conversationId, (entry) => {
      const now = Date.now();
      if (entry._metadata) {
        entry._metadata.endTimestamp = now;
        entry._metadata.lastActivityTimestamp = now;
      }
    });
  } catch (error) {
    console.error(
      `Error in modifyConversationEnd for ${conversationId}:`,
      error,
    );
  }
}

export function modifyHeartbeat(conversationId: string) {
  applyEntryModification(conversationId, (entry) => {
    if (entry._metadata) {
      entry._metadata.lastActivityTimestamp = Date.now();
    }
  });
}

export function detectConcurrentConversations(currentConversationId: string) {
  const log = loadLogFile();
  const now = Date.now();
  return Object.entries(log).some(([id, entry]) => {
    if (id === currentConversationId) return false;
    const metadata = entry._metadata;
    if (!metadata) return false;
    const { endTimestamp, lastActivityTimestamp } = metadata;
    // If explicitly ended, not concurrent. If no activity recorded, assume inactive.
    if (endTimestamp !== undefined || !lastActivityTimestamp) return false;
    return now - lastActivityTimestamp < ACTIVE_THRESHOLD_MS;
  });
}

export function hasCheckWorkBeenPrompted(conversationId: string) {
  const log = loadLogFile();
  return log[conversationId]?._metadata?.hasCheckWorkPrompted === true;
}

export function markCheckWorkPrompted(conversationId: string) {
  applyEntryModification(conversationId, (entry) => {
    if (entry._metadata) {
      entry._metadata.hasCheckWorkPrompted = true;
      entry._metadata.lastActivityTimestamp = Date.now();
    }
  });
}

export function hasExpandTestsBeenPrompted(conversationId: string) {
  const log = loadLogFile();
  return log[conversationId]?._metadata?.hasExpandTestsPrompted === true;
}

export function markExpandTestsPrompted(conversationId: string) {
  applyEntryModification(conversationId, (entry) => {
    if (entry._metadata) {
      entry._metadata.hasExpandTestsPrompted = true;
      entry._metadata.lastActivityTimestamp = Date.now();
    }
  });
}

export function isRuleRequestConversation(conversationId: string) {
  const log = loadLogFile();
  return log[conversationId]?._metadata?.isRuleRequest === true;
}

export function markAsRuleRequest(conversationId: string) {
  applyEntryModification(conversationId, (entry) => {
    if (entry._metadata) {
      entry._metadata.isRuleRequest = true;
    }
  });
}

function collectFilesExcludingTmp(
  files: readonly string[],
  allFiles: Set<string>,
) {
  for (const file of files) {
    // Filter out files in .cursor/tmp/ directory
    if (file.includes('.cursor/tmp/')) continue;
    allFiles.add(file);
  }
}

function extractFilesFromEntry(
  conversationEntry: ConversationEntry | MutableConversationEntry,
) {
  const allFiles = new Set<string>();
  for (const [key, value] of Object.entries(conversationEntry)) {
    if (key === '_metadata') continue;
    if (!Array.isArray(value)) continue;
    collectFilesExcludingTmp(value, allFiles);
  }
  return [...allFiles];
}

export function fetchAllConversationFiles({
  conversationId,
}: {
  readonly conversationId: string;
}) {
  const log = loadLogFile();
  const conversationEntry = log[conversationId];
  if (!conversationEntry) return [] as const;
  return extractFilesFromEntry(conversationEntry);
}

export function fetchChangedFiles({
  conversationId,
  generationId,
}: {
  readonly conversationId: string;
  readonly generationId: string;
}) {
  const log = loadLogFile();
  const conversationEntry = log[conversationId];
  if (!conversationEntry) return [] as const;
  const files = conversationEntry[generationId];
  if (!Array.isArray(files)) return [] as const;
  return files.filter((file) => {
    return !file.includes('.cursor/tmp/');
  });
}
