export const executeCommand = jest.fn((_command: string) => ({
  isSuccess: true,
  output: 'mock output',
}));

export const performAgentCheck = jest.fn();
export const executeMain = jest.fn();

