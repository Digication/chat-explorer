# Phase 12 — AI Chat Integration

Phases 01-11 built the complete application: backend with PostgreSQL, GraphQL API, TORI tagging pipeline, and consent system; frontend with Digication-style dark sidebar, MUI theme, Insights page with analytics visualizations, and Chat Explorer with bottom bar, student carousel, and slide-out panels. The Chat Explorer has a right panel placeholder for the AI chat. GraphQL resolvers already exist for `ChatSession` and `ChatMessage` entities, and the database schema supports persistent chat sessions with messages. This phase wires up the AI chat — a persistent, resumable conversational assistant that helps instructors analyze student reflections with full TORI framework expertise.

## Goal

Build a persistent AI chat system where instructors can ask questions about student reflections. Chat sessions are stored in PostgreSQL (not ephemeral), are resumable across sessions and devices, and include context from the currently viewed course, assignment, or selected comments. PII is sanitized by default (student names shown as initials) with a toggle to reveal full names. The chat panel slides in from the bottom-right in the Chat Explorer and is also accessible as a dedicated page via sidebar navigation.

## Implementation

### 1. AI System Prompt — `src/server/services/ai-instructions.ts`

Defines the system prompt and behavioral guidelines for the AI assistant.

- Export a `buildSystemPrompt(context: ChatContext): string` function that constructs the system prompt dynamically based on the current scope and data.
- **Base persona**: "You are an academic reflection analysis assistant with expertise in the TORI (Taxonomy of Reflection Indicators) framework. You help instructors understand patterns in student reflective writing."
- **Guidelines embedded in the prompt**:
  - Always cite evidence from actual student comments when making claims. Quote specific phrases.
  - Clearly indicate uncertainty — say "Based on the available data" rather than making absolute statements.
  - Provide pedagogical insights: suggest interventions, discussion prompts, or assignment adjustments.
  - Respect privacy: refer to students by initials unless the instructor has enabled full names.
  - Never fabricate data — if the provided context does not contain enough information to answer, say so.
  - When discussing TORI tags, explain what each tag means in the context of reflection depth.
- **Context injection**: the system prompt includes a structured data section with the relevant comments, student profiles, and TORI distributions (see Context Building below).

### 2. Context Building — `src/server/services/ai-chat.ts`

The chat service manages sessions, builds context for the LLM, and handles message exchange.

**Context scopes** — when creating a session, the instructor chooses what data the AI can see:

- **SELECTION scope**: The instructor has selected specific comments (up to 50) in the Chat Explorer. Context includes:
  - Each comment with: student initials (or full name if PII enabled), role (USER/ASSISTANT/SYSTEM), TORI tags, timestamp.
  - A summary of TORI tag distribution across the selected comments.
  - Thread context (which thread each comment belongs to).

- **COURSE scope**: Overview of an entire course. Context includes:
  - Course name, assignment count, student count, total comment count.
  - Aggregate TORI distribution (tag counts and percentages).
  - A representative sample of comments (up to 100) selected to cover the range of TORI tags and students.
  - Top co-occurring tag pairs.

- **CROSS_COURSE scope**: Comparison across multiple courses. Context includes:
  - Per-course summary statistics (student count, comment count, TORI distribution).
  - Comparative analysis data: which TORI tags are more prevalent in which course.
  - Sample comments from each course illustrating differences.

**PII handling**:
- By default, `showPII = false`: student names are replaced with initials (e.g., "John Smith" becomes "J.S.").
- When `showPII = true`: full names are included in the context.
- PII mode is stored on the session and can be toggled mid-conversation (triggers a context rebuild for subsequent messages).

### 3. Chat Service Functions

All functions in `src/server/services/ai-chat.ts`:

**`createSession(userId, scope, contextRefs, llmProvider?, llmModel?)`**
- Creates a new `ChatSession` record in PostgreSQL.
- `scope`: one of `SELECTION`, `COURSE`, `CROSS_COURSE`.
- `contextRefs`: object containing the IDs needed for that scope (e.g., `{ courseId, assignmentId, commentIds }` for SELECTION).
- `llmProvider` and `llmModel` default to `'openai'` and `'gpt-4o'` for now. Phase 14 will add multi-provider support.
- Returns the session object with its ID.

**`sendMessage(sessionId, userMessage)`**
- Saves the user's message to `ChatMessage` with `role: 'user'`.
- Builds the full message array: system prompt (with context) + all previous messages in the session + the new user message.
- Calls the LLM API (OpenAI for now).
- Saves the assistant's response to `ChatMessage` with `role: 'assistant'`.
- Returns the assistant's message.
- If this is the first exchange in the session, auto-generate a session title by asking the LLM: "Summarize this conversation in 5 words or fewer" and update the session record.

**`listSessions(userId)`**
- Returns all chat sessions for this user, sorted by `updatedAt` descending.
- Includes session title, scope, creation date, and message count.

**`getSession(sessionId)`**
- Returns the session with all its messages in chronological order.
- Verifies the requesting user owns the session.

**`deleteSession(sessionId)`**
- Soft-deletes the session (sets `deletedAt` timestamp).
- Verifies the requesting user owns the session.

### 4. AI Chat Panel — `src/components/ai/AiChatPanel.tsx`

Replaces the placeholder from Phase 11. Slides in from the bottom-right, anchored above the bottom bar.

- Uses MUI `Drawer` with `anchor="right"` and `Slide` transition (direction="left" — enters from the right).
- Panel width: 400px on desktop, full width on mobile.
- Anchored to `bottom: 60px` (above the bottom bar).

**Panel layout (top to bottom):**
1. **Header bar**: "AI Chat" title, session dropdown (ChatHistory), "New Chat" button, close button.
2. **Context controls**: `ContextScopeSelector` showing the active scope, `PII toggle`, `ModelPicker` (placeholder).
3. **Message area**: scrollable list of `ChatMessageBubble` components.
4. **Suggestion chips**: `SuggestionChips` showing 2-3 contextual question suggestions.
5. **Input area**: text input with send button. Disabled while waiting for LLM response.

### 5. Chat Message Bubble — `src/components/ai/ChatMessageBubble.tsx`

Displays a single chat message.

- **User messages**: right-aligned, dark background, white text.
- **Assistant messages**: left-aligned, lighter background, dark text. Support markdown rendering (bold, italic, lists, code blocks, quotes). Use a lightweight markdown renderer.
- Show timestamp below each message.
- Assistant messages show a subtle "AI" label.
- While the assistant is responding, show a typing indicator (animated dots) in a message bubble on the left side.

### 6. Suggestion Chips — `src/components/ai/SuggestionChips.tsx`

Contextual question suggestions displayed above the input area.

- Generate suggestions based on the current context scope:
  - SELECTION scope: "What TORI patterns do you see?", "How deep is this reflection?", "What follow-up questions could the instructor ask?"
  - COURSE scope: "Which students show the deepest reflection?", "What are the most common TORI tags?", "Are there students who need support?"
  - CROSS_COURSE: "How do reflection patterns differ across courses?", "Which course has the deepest engagement?"
- Render as a horizontal scrollable row of MUI `Chip` components.
- Clicking a chip sends that text as a message.
- Suggestions update when the scope or context changes.
- Hide suggestions after the first message is sent in a session (the conversation has started, so pre-set suggestions are less relevant).

### 7. Context Scope Selector — `src/components/ai/ContextScopeSelector.tsx`

Lets the instructor choose what data the AI can see.

- Dropdown or segmented control with options: `SELECTION`, `COURSE`.
- `CROSS_COURSE` option appears only when the scope selector at the page level is set to "All Courses".
- Changing the scope mid-conversation starts a new session (with a confirmation dialog: "Changing the scope will start a new conversation. Continue?").
- Shows a brief description of what each scope includes: "Selection: AI sees your selected comments", "Course: AI sees an overview of all comments in this course".

### 8. Model Picker — `src/components/ai/ModelPicker.tsx`

Placeholder UI for selecting the LLM provider and model. Will be fully wired in Phase 14.

- Dropdown showing the current model: "GPT-4o (OpenAI)".
- Disabled state with tooltip: "Additional models coming soon."
- The selected model is passed to `createSession` but for now only OpenAI is functional.

### 9. Chat History — `src/components/ai/ChatHistory.tsx`

Dropdown or collapsible sidebar within the panel showing past chat sessions.

- Query: `useQuery(GET_CHAT_SESSIONS, { variables: { userId } })`.
- Each session shows: auto-generated title, scope badge (SELECTION/COURSE/CROSS_COURSE), date, message count.
- Clicking a session loads it: fetches all messages and displays them in the message area.
- "New Chat" button at the top creates a fresh session.
- Swipe-to-delete (mobile) or delete icon (desktop) for removing sessions (with confirmation).
- Sessions persist across page reloads and devices — they are stored in PostgreSQL, not local state.

### 10. GraphQL Query Documents — `src/lib/queries/chat.ts`

```typescript
export const CREATE_CHAT_SESSION = gql`...`;     // creates a new session
export const SEND_CHAT_MESSAGE = gql`...`;        // sends a message and gets AI response
export const GET_CHAT_SESSIONS = gql`...`;        // lists all sessions for the user
export const GET_CHAT_SESSION = gql`...`;          // gets a session with all messages
export const DELETE_CHAT_SESSION = gql`...`;       // soft-deletes a session
```

The `SEND_CHAT_MESSAGE` mutation returns the assistant's response message. The client uses Apollo's cache to optimistically add the user's message to the UI while waiting for the response.

### 11. Dedicated AI Chat Page

In addition to the slide-out panel in Chat Explorer, the AI chat is accessible from a dedicated page via the sidebar navigation.

- Add "AI Chat" to the sidebar navigation (below "Chat Explorer").
- The dedicated page renders `AiChatPanel` as a full-width, full-height component (not in a drawer).
- Same functionality as the panel but with more screen space — message area takes full width.
- Session history shown as a sidebar on the left (on desktop) rather than a dropdown.
- The scope selector defaults to COURSE and allows switching to CROSS_COURSE.
- SELECTION scope is only available from the Chat Explorer panel (requires selected comments).

## Files to Create

| File | Purpose |
|---|---|
| `src/server/services/ai-instructions.ts` | System prompt builder with TORI expertise and behavioral guidelines |
| `src/server/services/ai-chat.ts` | Chat service: session management, context building, LLM integration |
| `src/components/ai/AiChatPanel.tsx` | Slide-out chat panel (and full-page variant) |
| `src/components/ai/ChatMessageBubble.tsx` | User and assistant message display with markdown |
| `src/components/ai/SuggestionChips.tsx` | Contextual question suggestion chips |
| `src/components/ai/ContextScopeSelector.tsx` | SELECTION / COURSE / CROSS_COURSE scope picker |
| `src/components/ai/ModelPicker.tsx` | Placeholder LLM model dropdown |
| `src/components/ai/ChatHistory.tsx` | Session list and management |
| `src/lib/queries/chat.ts` | GraphQL queries and mutations for chat sessions and messages |

## Verification

- [ ] `createSession` stores a new session in PostgreSQL with correct scope and context references
- [ ] `sendMessage` saves user message, calls OpenAI, saves assistant response, and returns it
- [ ] First exchange auto-generates a session title from the LLM
- [ ] `listSessions` returns all sessions for the user sorted by most recent
- [ ] `getSession` returns a session with all messages in chronological order
- [ ] `deleteSession` soft-deletes and the session no longer appears in `listSessions`
- [ ] System prompt includes TORI expertise guidelines and the privacy/evidence-citing rules
- [ ] SELECTION context correctly includes up to 50 comments with initials (PII off) or full names (PII on)
- [ ] COURSE context includes aggregate stats and a representative sample of comments
- [ ] PII toggle switches between initials and full names in the context
- [ ] AiChatPanel slides in from the right with correct 400px width and bottom: 60px anchor
- [ ] Chat message bubbles render correctly: user right-aligned, assistant left-aligned with markdown
- [ ] Typing indicator shows while waiting for LLM response
- [ ] SuggestionChips display context-appropriate questions and send on click
- [ ] Suggestions hide after the first message in a session
- [ ] ContextScopeSelector shows confirmation dialog when changing scope mid-conversation
- [ ] ChatHistory dropdown lists past sessions with title, scope, date, and message count
- [ ] Clicking a past session loads its full message history
- [ ] Sessions persist across page reloads (data from PostgreSQL, not local state)
- [ ] Dedicated AI Chat page renders the panel at full width with sidebar session list
- [ ] "AI Chat" link appears in the sidebar navigation
- [ ] ModelPicker shows "GPT-4o (OpenAI)" in disabled state with tooltip
- [ ] Consent filtering is respected: excluded students' comments never appear in any context scope
