# Splitify App Design

## Product Summary

Splitify is a web app for reorganizing large Spotify playlists into smaller, curated playlists with help from an adaptable AI agent. The app authenticates with Spotify, reads the user's playlists and tracks, asks the agent for a structured split plan, lets the user edit the preview, and then creates the destination playlists in Spotify.

The first version is designed for self-hosted or personal deployment, with server-side tokens, SQLite for local development, and a provider-agnostic AI integration surface.

## Core User Flow

1. The user signs in with Spotify.
2. The dashboard loads the user's playlists.
3. The user selects a source playlist.
4. The user chooses a split mode:
   - Prompt + categories
   - Prompt only
   - Categories only
5. The user chooses whether tracks must be unique or can overlap across playlists.
6. The app fetches all source playlist tracks with Spotify pagination.
7. The AI agent returns structured categories and track assignments.
8. The user edits the preview by renaming categories, moving tracks, or removing tracks.
9. The app creates private Spotify playlists and adds tracks in API-sized batches.
10. The dashboard displays created playlist links.

Playlist management is also available from the dashboard. Removing a playlist uses Spotify's unfollow endpoint, which removes it from the user's library rather than permanently deleting it from Spotify.

## Architecture

### Frontend

- Framework: Next.js App Router with React and TypeScript.
- Styling: Tailwind CSS through global design tokens in `src/app/globals.css`.
- Main UI:
  - `src/app/page.tsx`: unauthenticated landing view and authenticated dashboard shell.
  - `src/components/dashboard.tsx`: playlist selection, split controls, editable preview, execution, and playlist removal.
  - `src/components/auth-buttons.tsx`: Spotify sign-in/sign-out buttons.

The UI intentionally keeps the first screen as the real app experience, not a marketing page. Dashboard controls are compact and operational: selects for modes, text areas for prompts/categories, icon buttons for actions, and a clear status pill for feedback.

### Authentication

- Library: NextAuth.js with Spotify OAuth.
- Adapter: Prisma adapter.
- Session strategy: database sessions.
- Tokens:
  - Spotify access and refresh tokens are stored server-side in Prisma's `Account` table.
  - Tokens are never exposed to the browser.
  - Server helpers refresh expired Spotify access tokens before making Spotify API calls.

Required Spotify scopes:

- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-private`
- `playlist-modify-public`
- `user-read-email`
- `user-read-private`

### Server/API Layer

All Spotify and AI-agent work happens server-side through route handlers:

- `GET /api/playlists`
  - Lists the authenticated user's Spotify playlists.
  - Resolves track totals with a lightweight per-playlist track-total request.

- `DELETE /api/playlists/:id`
  - Removes a playlist from the user's Spotify library via Spotify's unfollow endpoint.
  - Returns `{ ok: true }` to the client when complete.

- `GET /api/playlists/:id/tracks`
  - Fetches all usable tracks for a playlist with pagination.
  - Filters out local/unusable tracks and normalizes metadata.

- `POST /api/splits`
  - Creates a split run.
  - Fetches source playlist tracks.
  - Sends compact track metadata to the AI agent.
  - Persists the generated categories and assignments.

- `PATCH /api/splits/:id`
  - Saves edits from the preview.
  - Validates category names, valid track IDs, and duplicate policy.

- `POST /api/splits/:id/execute`
  - Creates destination playlists.
  - Adds tracks to each destination playlist in Spotify batches.
  - Stores created Spotify playlist IDs and URLs.

### Spotify Client

`src/lib/spotify.ts` centralizes Spotify access:

- Fetches and refreshes OAuth tokens.
- Lists playlists.
- Fetches track totals and full track lists.
- Creates playlists.
- Adds tracks in chunks of 100 URIs.
- Removes playlists from the user's library.

Spotify responses can be empty for successful mutation endpoints. The shared `spotifyFetch` helper treats empty successful responses as valid instead of trying to parse JSON.

### AI Agent Layer

`src/lib/ai-agent.ts` is the provider adapter for classification. Product code calls it as an AI agent, not as a provider-specific implementation.

Responsibilities:

- Build the system prompt and user payload.
- Send compact track metadata:
  - Spotify track ID
  - Title
  - Artists
  - Album
- Request structured JSON output.
- Validate the result with Zod.
- Retry once with a repair prompt if validation fails.
- Process large playlists in chunks and merge category results.

Configuration:

- `AI_AGENT_API_KEY`
- `AI_AGENT_MODEL`

The rest of the app should depend on the classification contract, not provider-specific names or SDKs.

## Data Model

Prisma models include the standard NextAuth tables:

- `User`
- `Account`
- `Session`
- `VerificationToken`

Splitify-specific models:

- `SplitRun`
  - User ID
  - Source playlist ID/name
  - Prompt
  - Mode
  - Duplicate policy
  - Playlist prefix
  - Visibility
  - Status
  - Error

- `SplitCategory`
  - Split run ID
  - Name
  - Description
  - Sort order
  - Created Spotify playlist ID/URL

- `SplitAssignment`
  - Split run ID
  - Category ID
  - Spotify track ID/URI
  - Track name
  - Artists
  - Album
  - Duration
  - Source order
  - Category order
  - Serialized metadata

`SplitAssignment.trackMetadata` is stored as a JSON string for SQLite compatibility. If production moves to PostgreSQL, this can be migrated to a native JSON column.

## State Model

Split runs use these status values:

- `draft`: created but not processing.
- `classifying`: track data is being sent to the AI agent.
- `ready`: preview is generated and editable.
- `executing`: Spotify playlists are being created/populated.
- `completed`: Spotify execution finished.
- `failed`: classification or execution failed.

The UI treats `ready` as editable and executable. Completed or executing runs cannot be edited.

## Validation Rules

- Every category must have a non-empty name.
- Assignments must reference known track IDs from the source playlist.
- In `single` duplicate mode, a track can only appear in one category.
- In `overlap` mode, a track can appear in multiple categories.
- Empty categories are removed from AI-agent output during validation.
- Unknown or invented track IDs are ignored during classification validation.

## Design System

Visual direction:

- Quiet, utility-focused dashboard.
- Light neutral background with Spotify green as the primary action color.
- Dark ink color for execution actions and brand tile.
- Rounded controls use an 8px-or-less radius.
- Repeated preview groups are cards; page sections remain simple app surfaces.

Important UI behavior:

- The playlist selector and selected-playlist card show the same current playlist.
- The selected-playlist card includes a remove-from-library icon action with confirmation.
- The preview is editable before Spotify writes happen.
- Loading states use inline spinners and a status message.
- Destructive actions use a red icon treatment and confirmation prompt.

## Error Handling

- API routes return JSON error objects where possible.
- Client-side response parsing tolerates empty response bodies.
- Spotify mutation helpers tolerate successful empty responses.
- Spotify 401 responses trigger one token refresh and retry.
- Classification failures mark the split run as `failed` with an error message.
- Execution failures mark the split run as `failed` and preserve created data already stored.

## Environment

Local development expects:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://127.0.0.1:3000"
SPOTIFY_CLIENT_ID=""
SPOTIFY_CLIENT_SECRET=""
AI_AGENT_API_KEY=""
AI_AGENT_MODEL=""
```

The Spotify redirect URI must exactly match `NEXTAUTH_URL`:

```text
http://127.0.0.1:3000/api/auth/callback/spotify
```

If the app is opened at `localhost`, Spotify must also include:

```text
http://localhost:3000/api/auth/callback/spotify
```

## Testing Strategy

Current focused tests cover:

- Spotify URI chunking.
- Spotify token refresh behavior.
- Empty successful Spotify responses for playlist removal.
- Split-plan chunking.
- Manual category parsing.
- Duplicate assignment validation.
- Classification result merging.
- Playlist name formatting.

Recommended next tests:

- Mocked integration test for `DELETE /api/playlists/:id`.
- Mocked integration test for `POST /api/splits`.
- Mocked integration test for `POST /api/splits/:id/execute`.
- Browser-level test for dashboard playlist removal and preview editing.

## Deployment Notes

- Vercel is a good fit for the Next.js serverless routes.
- Production should use PostgreSQL instead of SQLite.
- All secrets must be configured as environment variables.
- Spotify production redirect URIs must include the final deployed domain.
- The AI-agent provider can be swapped by preserving the `classifyTracksWithAiAgent` contract.
