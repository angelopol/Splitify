# Splitify

Splitify is a Next.js app that routes a large Spotify playlist into smaller curated playlists using an adaptable AI agent. It reads the user's Spotify playlists, asks the agent for a structured split plan, lets the user edit the preview, and then creates private playlists back in Spotify.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- NextAuth.js with Spotify OAuth
- Prisma with SQLite for local development
- Configurable AI agent model
- Vitest for focused unit tests

## Local Setup

1. Install dependencies:

   ```bash
   corepack pnpm install
   ```

2. Create `.env.local` from `.env.example` and fill the values:

   ```bash
   DATABASE_URL="file:./dev.db"
   NEXTAUTH_SECRET="replace-with-a-long-random-secret"
   NEXTAUTH_URL="http://localhost:3000"
   SPOTIFY_CLIENT_ID=""
   SPOTIFY_CLIENT_SECRET=""
   AI_AGENT_API_KEY=""
   AI_AGENT_MODEL=""
   ```

3. In the Spotify Developer Dashboard, add this redirect URI:

   ```text
   http://localhost:3000/api/auth/callback/spotify
   ```

4. Generate Prisma Client and apply the schema:

   ```bash
   corepack pnpm prisma:generate
   corepack pnpm prisma:migrate
   ```

5. Start the app:

   ```bash
   corepack pnpm dev
   ```

## Spotify Scopes

The Spotify OAuth provider requests:

- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-private`
- `playlist-modify-public`
- `user-read-email`
- `user-read-private`

Access and refresh tokens are stored server-side by NextAuth in Prisma's `Account` table. API routes refresh expired Spotify access tokens before calling Spotify.

## Product Flow

1. Sign in with Spotify.
2. Select a source playlist.
3. Choose prompt, manual categories, or both.
4. Choose whether songs can overlap across generated playlists.
5. Generate an AI agent preview.
6. Rename categories, move tracks, or remove tracks.
7. Create private Spotify playlists with the configured prefix.

## Scripts

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm prisma:generate
corepack pnpm prisma:migrate
corepack pnpm prisma:studio
```

## Notes

- Spotify's restricted/deprecated Audio Features and Audio Analysis endpoints are not used. Splitify only sends compact track metadata to the AI agent: track ID, title, artists, and album.
- Large playlists are processed in chunks and then consolidated into one editable plan.
- `SplitAssignment.trackMetadata` is stored as a JSON string for SQLite compatibility.
