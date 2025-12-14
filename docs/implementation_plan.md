# OpenRouter OAuth PKCE Implementation Plan

## Goal
Enable users to authenticate with their own OpenRouter accounts using OAuth PKCE. This allows them to use their own API credits, bypassing the shared (and rate-limited) free tier key.

## User Review Required
> [!IMPORTANT]
> This change moves the API key management to the client-side (browser) for authenticated users. The backend will act as a proxy but will prioritize the user's key over the server's `.env` key.

## Proposed Changes

### Frontend (`docs/viewer/src`)

#### [NEW] `src/utils/auth.js`
- Implement PKCE helper functions:
    - `generateCodeVerifier()`
    - `generateCodeChallenge(verifier)`
- Implement `exchangeCodeForKey(code)`

#### [MODIFY] `src/App.jsx`
- Add state for `userApiKey`.
- Check for `code` query parameter on load (callback handling).
- If `code` exists, exchange for key and save to `localStorage`.
- Pass `userApiKey` to `Chat` component/requests.

#### [NEW] `src/components/SettingsModal.jsx`
- A modal dialog with tabs (currently just "General" or "API").
- **API Section**:
    - **Manual Key Input**: Text field to paste `sk-or-...` key.
    - **OAuth Login**: "Connect OpenRouter" button (PKCE).
    - **Status**: Show which key is active.
- **Logic**:
    - `activeKey = manualKey || oauthKey`.
    - Save both to `localStorage`.

#### [MODIFY] `src/App.jsx`
- Add `settingsOpen` state.
- Add "Settings" button (gear icon) to the UI (e.g., top right or sidebar).
- If no key is set (and no env key detected via bridge?), show a "Configure API" button prominently.
- Pass `activeKey` to `Chat` component.

#### [NEW] `src/utils/auth.js`
- Implement PKCE helper functions.
- Implement `exchangeCodeForKey(code)`.

#### [MODIFY] `src/components/Chat.jsx` (or wherever fetch happens)
- Update `fetch('/chat')` to include `Authorization: Bearer <activeKey>` if `activeKey` exists.

### Backend (`scripts/bridge.py`)

#### [MODIFY] `scripts/bridge.py`
- Update `ChatRequest` or the `/chat` endpoint signature to accept `Authorization` header.
- **Logic Change**:
    - Check `request.headers.get("Authorization")`.
    - If present, create a *temporary* `OpenAI` client with that key.
    - If missing, use the global `OPENROUTER_CLIENT` (fallback to `.env` key).

## Verification Plan

### Manual Verification
1.  **Login Flow**: Click "Connect OpenRouter", verify redirect, login, and return with API key.
2.  **Chat with User Key**: Send a message, verify it works (and ideally check OpenRouter activity log if possible, or just ensure no 429s).
3.  **Fallback**: Clear local storage, verify chat still works (using server key).
