// This file reproduces the exact code from the bug report

interface DatadogIssuePayload {
  id: string;
  data: unknown;
}

class DatadogErrorProcessor {
  constructor(payload: DatadogIssuePayload) {
    console.log(payload);
  }

  async process() {
    return Promise.resolve();
  }
}

async function datadog(req: { body: unknown }) {
  const { body } = req;

  // This is the line that should not be flagged by the ESLint rule
  const processor = new DatadogErrorProcessor(body as DatadogIssuePayload);

  await processor.process();
}
