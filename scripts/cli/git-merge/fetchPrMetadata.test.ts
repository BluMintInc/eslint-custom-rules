import { runCommand } from '../git-utils';
import { fetchPrMetadata } from './fetchPrMetadata';

jest.mock('../git-utils');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('fetchPrMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns PR metadata with CodeRabbit summary', () => {
    const prJson = JSON.stringify({
      number: 42,
      title: 'Add new feature',
      body: 'This PR adds a new feature',
      url: 'https://github.com/owner/repo/pull/42',
    });

    mockRunCommand
      .mockReturnValueOnce(prJson)
      .mockReturnValueOnce('CodeRabbit summary content');

    const result = fetchPrMetadata(42);

    expect(result).toEqual({
      number: 42,
      title: 'Add new feature',
      description: 'This PR adds a new feature',
      url: 'https://github.com/owner/repo/pull/42',
      codeRabbitSummary: 'CodeRabbit summary content',
    });
  });

  it('returns null description when body is null', () => {
    const prJson = JSON.stringify({
      number: 123,
      title: 'Quick fix',
      body: null,
      url: 'https://github.com/owner/repo/pull/123',
    });

    mockRunCommand.mockReturnValueOnce(prJson).mockReturnValueOnce('');

    const result = fetchPrMetadata(123);

    expect(result.description).toBeNull();
  });

  it('returns null codeRabbitSummary when fetch fails', () => {
    const prJson = JSON.stringify({
      number: 99,
      title: 'Test PR',
      body: 'Test body',
      url: 'https://github.com/owner/repo/pull/99',
    });

    mockRunCommand.mockReturnValueOnce(prJson).mockImplementationOnce(() => {
      throw new Error('No CodeRabbit comment found');
    });

    const result = fetchPrMetadata(99);

    expect(result.codeRabbitSummary).toBeNull();
  });

  it('returns null codeRabbitSummary when comments output is empty', () => {
    const prJson = JSON.stringify({
      number: 50,
      title: 'Another PR',
      body: 'Description',
      url: 'https://github.com/owner/repo/pull/50',
    });

    mockRunCommand.mockReturnValueOnce(prJson).mockReturnValueOnce('');

    const result = fetchPrMetadata(50);

    expect(result.codeRabbitSummary).toBeNull();
  });

  it('calls correct gh commands', () => {
    const prJson = JSON.stringify({
      number: 77,
      title: 'PR',
      body: 'Body',
      url: 'https://github.com/owner/repo/pull/77',
    });

    mockRunCommand.mockReturnValueOnce(prJson).mockReturnValueOnce('Summary');

    fetchPrMetadata(77);

    expect(mockRunCommand).toHaveBeenNthCalledWith(
      1,
      'gh pr view 77 --json number,title,body,url',
      true,
    );
    expect(mockRunCommand).toHaveBeenNthCalledWith(
      2,
      `gh pr view 77 --json comments --jq '.comments[] | select(.author.login == "coderabbitai") | .body' | head -n 100`,
      true,
    );
  });
});
