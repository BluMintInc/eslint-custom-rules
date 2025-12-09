export const executeCommand = jest.fn((command: string) => ({
  isSuccess: true,
  output: 'mock output',
}));

export const performAgentCheck = jest.fn();
export const executeMain = jest.fn();

export type Input = {
  readonly conversation_id: string;
  readonly generation_id: string;
  readonly loop_count: number;
  readonly status?: 'completed' | 'aborted' | 'error';
  readonly [key: string]: unknown;
};

export type AgentCheckResult = { readonly followup_message?: string };

