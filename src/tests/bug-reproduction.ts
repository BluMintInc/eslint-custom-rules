// Simple test case to reproduce the bug with constructor arguments
interface DataPayload {
  id: string;
  data: unknown;
}

class DataProcessor {
  constructor(payload: DataPayload) {
    console.log(payload);
  }

  process(): void {
    // Process the data
  }
}

function processData(rawData: unknown): void {
  // This should not trigger the rule since the type assertion is used as a constructor argument
  const processor = new DataProcessor(rawData as DataPayload);
  processor.process();
}
