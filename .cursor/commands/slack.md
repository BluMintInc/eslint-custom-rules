# Slack Message Drafter

## Purpose
Draft concise, casual Slack messages based on the current conversation context and user instructions. Emphasize brevity and clarity.

## Format Guidelines

### Structure
- Keep messages to **one paragraph or less** unless the user explicitly requests otherwise
- Use appropriate Slack formatting (@mentions, `code` formatting, etc.)
- Be direct and action-oriented
- Maintain a conversational tone

### Writing Style
- Lead with the most important information
- Be concise—every word should add value
- Use clear, simple language
- Leverage necessary context but avoid unnecessary details
- If mentioning technical details, use appropriate formatting (e.g., `'signInAndCustomizeUsername'` for code references)

### Markdown Limitations
Slack formatting is *not quite* markdown:
- Use single asterisk for *bold* (not double)
- Use single underscore for _italic_
- Code blocks use ``` without language specification

### Common Elements
- **Mentions**: Use `@username` for addressing specific people
- **Action Items**: Be clear about what action is needed and priority level
- **Context**: Include just enough context to make the message self-contained

## Workflow

1. **Read Conversation Context**: Review the conversation history to understand the context
2. **Parse User Instructions**: Extract what the message should cover from the user's input
3. **Draft Message**: Create a concise Slack message that:
   - Addresses the intended recipient(s)
   - Conveys the key information
   - Includes any requested action items or priorities
   - Stays within one paragraph unless otherwise specified
4. **Output**: Provide the draft message ready to copy into Slack

## Example

**Input**: "i've made a github issue for the above, and a Cursor background agent is working on implementing the issue. Please draft a Slack message letting safkat.k know there was security vulnerability with joining tournaments, why, and that he should review the agent's implementation of this ticket and merge it in with high priority."

**Output**: "Hey @safkat.k - Found a security vulnerability where users accepting team invites could bypass the sign-in and username customization guards that other tournament registration flows enforce, creating an inconsistent security posture. I've created a GitHub issue and a Cursor background agent is implementing the fix - can you review and merge it with high priority? The fix ensures team invite acceptance uses the same `'signInAndCustomizeUsername'` guard flow as direct tournament joins."

## Key Principles

1. **Brevity First**: Default to one paragraph unless explicitly told otherwise
2. **Context-Aware**: Use conversation context to inform the message
3. **Action-Oriented**: Clearly state what action is needed and priority
5. **Self-Contained**: Include enough context that the message makes sense without reading the full conversation

