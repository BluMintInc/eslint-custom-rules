import { ruleTesterTs } from '../utils/ruleTester';
import { omitIndexHtml } from '../rules/omit-index-html';

const buildError = (url: string) => ({
  messageId: 'omitIndexHtml' as const,
  data: {
    url,
    suggestedUrl: url.replace(/\/index\.html($|[?#])/, '/$1'),
  },
});

ruleTesterTs.run('omit-index-html', omitIndexHtml, {
  valid: [
    // URLs without index.html
    {
      code: 'const homepage = "https://example.com/";',
    },
    {
      code: 'const aboutPage = "https://example.com/about/";',
    },
    // URLs with query parameters or hash fragments (allowed by default)
    {
      code: 'const pageWithParams = "https://example.com/index.html?ref=source";',
    },
    {
      code: 'const pageWithHash = "https://example.com/index.html#section";',
    },
    // Non-URL strings containing index.html
    {
      code: 'const filePath = "/usr/local/project/index.html";',
      options: [{ allowWithQueryOrHash: true }],
    },
    // Template literals without index.html
    {
      code: 'const url = `https://example.com/${page}/`;',
    },
  ],
  invalid: [
    // Basic URL with index.html
    {
      code: 'const homepage = "https://example.com/index.html";',
      errors: [buildError('https://example.com/index.html')],
      output: 'const homepage = "https://example.com/";',
    },
    // URL with path and index.html
    {
      code: 'const aboutPage = "https://example.com/about/index.html";',
      errors: [buildError('https://example.com/about/index.html')],
      output: 'const aboutPage = "https://example.com/about/";',
    },
    // Relative URL with index.html
    {
      code: 'const relativePath = "/about/index.html";',
      errors: [buildError('/about/index.html')],
      output: 'const relativePath = "/about/";',
    },
    // URL with query parameters when not allowed
    {
      code: 'const pageWithParams = "https://example.com/index.html?ref=source";',
      options: [{ allowWithQueryOrHash: false }],
      errors: [buildError('https://example.com/index.html?ref=source')],
      output: 'const pageWithParams = "https://example.com/?ref=source";',
    },
    // URL with hash fragment when not allowed
    {
      code: 'const pageWithHash = "https://example.com/index.html#section";',
      options: [{ allowWithQueryOrHash: false }],
      errors: [buildError('https://example.com/index.html#section')],
      output: 'const pageWithHash = "https://example.com/#section";',
    },
    // Template literal with index.html
    {
      code: 'const url = `https://example.com/index.html`;',
      errors: [buildError('https://example.com/index.html')],
      // No output as we don't auto-fix template literals
    },
    // Template literal with dynamic part and index.html
    {
      code: 'const url = `https://example.com/${page}/index.html`;',
      errors: [buildError('https://example.com/${page}/index.html')],
      // No output as we don't auto-fix template literals
    },
  ],
});
