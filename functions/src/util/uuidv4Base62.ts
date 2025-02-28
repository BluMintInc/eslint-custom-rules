// Simple implementation for testing purposes
export function uuidv4Base62(): string {
  return Math.random().toString(36).substring(2, 15);
}
