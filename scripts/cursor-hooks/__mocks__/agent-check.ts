import type { AgentCheckResult, Input } from '../types';

export const executeCommand = jest.fn((command: string) => ({
  isSuccess: true,
  output: 'mock output',
}));

export const performAgentCheck = jest.fn();
export const executeMain = jest.fn();

