# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Uses pnpm via corepack (`corepack pnpm ...`).

```bash
corepack pnpm dev              # start dev server (http://localhost:3000)
corepack pnpm build            # prisma generate + next build
corepack pnpm lint             # eslint .
corepack pnpm typecheck        # tsc --noEmit
corepack pnpm test             # vitest run (all tests)
corepack pnpm vitest run src/lib/split-plan.test.ts   # single test file
corepack pnpm prisma:generate  # regenerate Prisma Client after schema changes
corepack pnpm prisma:migrate   # prisma migrate dev
corepack pnpm prisma:studio
```

Env vars go in `.env.local` (see `.env.example`): `DATABASE_URL` (SQLite `file:./dev.db`), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SPOTIFY_CLIENT_ID/SECRET`, `AI_AGENT_API_KEY`, `AI_AGENT_MODEL`.

## What the app does

Splits a large Spotify playlist into smaller curated playlists. Flow: Spotify OAuth sign-in → pick source playlist → configure split (freeform prompt, manual categories, or both; plus a duplicate policy of `single` or `overlap`) → AI generates a classification preview persisted as a draft `SplitRun` → user edits categories/track assignments → execute creates real Spotify playlists (named with `playlistPrefix`).

## Architecture

Next.js App Router, TypeScript, Tailwind v4, Prisma + SQLite, NextAuth v4 (database sessions), Vitest.

- `src/auth.ts` — NextAuth options with Spotify provider + PrismaAdapter; `auth()` wraps `getServerSession`. Session callback puts `user.id` on the session (typed in `src/types/next-auth.d.ts`). Spotify access/refresh tokens live in Prisma's `Account` table, never on the client.
- `src/lib/spotify.ts` — all Spotify Web API access. `spotifyFetch` resolves a valid token per call, refreshes proactively (60s before expiry) and retries once on 401. Playlist reads paginate; track adds chunk at 100 URIs. Local tracks / episodes / null-ID tracks are filtered out during normalization.
- `src/lib/split-plan.ts` — pure domain logic (no I/O): zod schema for the AI's classification result, `validateClassificationResult` (drops invented track IDs, enforces duplicate policy), chunking, merging chunk results, manual-category parsing. This is where the unit tests live.
- `src/lib/ai-agent.ts` — calls the Google Generative Language API (`AI_AGENT_MODEL`) with a JSON response schema. Splits tracks into 150-track chunks, classifies each sequentially, and on a validation failure retries once with a "repair" prompt containing the previous error. Only compact metadata (id, title, artists, album) is sent to the AI — Spotify's Audio Features endpoints are deliberately not used.
- `src/app/api/` — route handlers: `playlists` (list/read source playlists + tracks), `splits` (create run → classify → persist plan; update/read/delete a run), `splits/[id]/execute` (create Spotify playlists and fill them). Routes authenticate via `auth()` and use `serializeSplitRun`/`splitRunInclude` from `src/lib/split-serializer.ts` for consistent payloads.
- `src/components/dashboard.tsx` — the single client-side UI for the whole flow (playlist selection, split config, preview editing, execution).

## Data model notes

`SplitRun` (status: draft → …) owns `SplitCategory` (ordered) and `SplitAssignment` rows. Re-generating a plan deletes and recreates categories/assignments in one transaction (`src/app/api/splits/route.ts`). `SplitAssignment.trackMetadata` is a JSON **string** for SQLite compatibility — parse/stringify at the boundary.
