# Memory Architecture & Interactive Context Management

> **Status**: Draft v2  
> **Created**: 2024-12-14  
> **Vision**: Transparent, editable context management for agentic AI

## Executive Summary

This is a **novel architecture** for context management that:
1. Makes the LLM's context window **transparent** to the user
2. Allows **editing** of context before sending
3. Supports **LLM-assisted compression** of segments
4. Has **parameterized rules** that users can tune
5. Persists **learner profiles** across sessions

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTEXT BUDGET                                     │
│                   50% of model context window (max 100k tokens)              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │  SYSTEM PROMPT   │  │  LEARNER PROFILE │  │  VIEWING CONTEXT         │   │
│  │  (fixed ~2k)     │  │  (dynamic ~1k)   │  │  (file code ~3k)         │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    CONVERSATION MEMORY                                │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │  TIER 1: Full Text (last N turns, configurable, default 3)          │   │
│  │  TIER 2: Summaries (next M turns, configurable, default 12)         │   │
│  │  TIER 3: On-Demand (older turns, available via tool request)        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    INJECTED CONTEXT (RAG + user expansions)          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: User Profiles & IndexedDB Schema

### Checklist
- [ ] Update Dexie schema in `db.js`:
  - [ ] Add `users` table
  - [ ] Add `learnerProfiles` table
  - [ ] Add `contextSettings` table (per-user params)
  - [ ] Add `turnSummaries` table (cached summaries)
- [ ] Create `UserSelector.jsx` component
- [ ] Add `currentUserId` state to `App.jsx`
- [ ] Tie conversations to users via `userId`
- [ ] Create default "Guest" user on first load

### Data Model
```js
db.version(2).stores({
  users: '++id, name, createdAt',
  learnerProfiles: '++id, &userId, updatedAt',
  contextSettings: '++id, &userId',
  conversations: '++id, userId, title, createdAt',
  messages: '++id, conversationId, role, content, tokenCount, createdAt',
  turnSummaries: '++id, messageId, summary, tokenCount'
});
```

### Context Settings Schema (Parameterized)
```json
{
  "userId": 1,
  "context_budget_percent": 50,
  "context_budget_max_tokens": 100000,
  "tier1_full_text_turns": 3,
  "tier2_summary_turns": 12,
  "file_content_max_chars": 5000,
  "auto_summarize": true,
  "show_context_preview": true
}
```

---

## Phase 2: Token Counting & Budget

### Checklist
- [ ] Add `/models/{model}/context_size` endpoint
- [ ] Calculate budget: `min(model_context * 0.5, 100000)`
- [ ] Add `tokenCount` to messages (estimate at save)
- [ ] Track token usage per segment
- [ ] Display token bar in UI

---

## Phase 3: Tiered Conversation Memory

### Checklist
- [ ] Generate summary after each response (async)
- [ ] Store in `turnSummaries` table
- [ ] Build context:
  - Tier 1: Last N turns → full text
  - Tier 2: Next M turns → summaries
  - Tier 3: Older → omitted (but available via tool)
- [ ] Include turn reference IDs

---

## Phase 4: Context Inspector UI

### Checklist
- [ ] Add collapsible "Context Inspector" panel
- [ ] Show segments with:
  - [ ] Label, token count
  - [ ] Expand/collapse
  - [ ] [Edit] → inline editor
  - [ ] [Compress] → LLM re-summarizes
  - [ ] [Remove] → exclude
- [ ] Token budget bar
- [ ] [Send with Context] button

### UI Mockup
```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Context Inspector                    [Budget: 45k/100k]     │
├─────────────────────────────────────────────────────────────────┤
│  ☑ System Prompt                                   [2,100 tok]  │
│    You are 'NanoChat'...                                        │
│    [Edit] [View Full]                                           │
│                                                                  │
│  ☑ Learner Profile                                   [450 tok]  │
│    Expertise: beginner | Topics: tensors (0.8)                  │
│    [Edit]                                                       │
│                                                                  │
│  ☑ Viewing: nanochat/gpt.py                        [3,200 tok]  │
│    class GPT(nn.Module): ...                                    │
│    [Edit] [View Full] [Skip]                                    │
│                                                                  │
│  ☑ Turn 1 (full)                                   [1,200 tok]  │
│    User: "what is MLP?"                                         │
│    Assistant: "An MLP is..."                                    │
│    [Compact] [Skip] [View Full] [Copy to Prompt]                │
│                                                                  │
│  ☐ Turn 0 (compacted)                                [80 tok]   │
│    Greeted user, asked about experience                         │
│    [Rehydrate Full] [Copy to Prompt]                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Compression Prompt (optional):                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Focus on technical concepts, drop greetings                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  [🗜️ Compress Checked]                    [✉️ Send with Context] │
└─────────────────────────────────────────────────────────────────┘
```

### Compression & Rehydration

**Per-Turn Controls:**
- ☑ **Checkbox**: Include in context (checked) or exclude
- **[Compact]**: Compress to ~50% using LLM with preset prompt
- **[Skip]**: Reduce to 1-line summary only
- **[View Full]**: Show original uncompressed text
- **[Rehydrate Full]**: Pull full text back from IndexedDB
- **[Copy to Prompt]**: Insert text into current message

**Compression Prompt:**
- Optional text field for steering (e.g., "Focus on code, drop pleasantries")
- Default preset used if empty: "Summarize preserving technical details"
- Applied to all checked items when [Compress Checked] clicked

**Rehydration:**
- Each turn stores `messageId` link to full text in IndexedDB
- [Rehydrate Full] fetches original and replaces compacted version
- Useful for digging into specific past context

---

## Phase 5: Frontend-Backend Context Binding

### Checklist
- [ ] Frontend builds `context_segments` array
- [ ] Send full context to backend
- [ ] Backend can return `retrieve_context: ["turn_12"]`
- [ ] Frontend fetches from IndexedDB, injects next request

### API
```python
class ContextSegment(BaseModel):
    id: str           # "turn_5", "file_gpt.py"
    type: str         # "turn", "file", "profile"
    content: str
    token_count: int
    is_summary: bool

class ChatRequest(BaseModel):
    message: str
    model: str
    context_segments: List[ContextSegment]
    context_settings: dict

class ChatResponse(BaseModel):
    response: str
    focused_nodes: List[str]
    retrieve_context: Optional[List[str]]
    profile_updates: Optional[dict]
```

---

## Phase 6: Post-Turn Profile Updates

### Checklist
- [ ] After response, call fast model for analysis
- [ ] Return `profile_updates`
- [ ] Frontend applies to IndexedDB
- [ ] Toast: "Profile updated: mlp → 0.6"

---

## Phase 7: Settings UI

### Checklist
- [ ] Context Settings tab in modal
- [ ] Sliders: budget %, max tokens, tier sizes
- [ ] Toggles: auto-summarize, show preview
- [ ] Save to `contextSettings`

---

## Implementation Order

| Phase | Name | Complexity | Dependencies |
|-------|------|------------|--------------|
| 1 | User Profiles | Medium | None |
| 2 | Token Counting | Low | Phase 1 |
| 3 | Tiered Memory | Medium | Phase 2 |
| 4 | Context Inspector | High | Phase 3 |
| 5 | Frontend-Backend | High | Phase 4 |
| 6 | Profile Updates | Medium | Phase 1 |
| 7 | Settings UI | Low | Phase 1 |

---

## Novel Aspects

This architecture is **unique** because:
1. **Transparent**: User sees exactly what the LLM sees
2. **Editable**: User can modify context before sending
3. **Interactive Memory**: LLM can request more detail
4. **Parameterized**: All thresholds user-configurable
5. **Learner-Aware**: Persistent profile tracks growth

**No existing tool does this.**
