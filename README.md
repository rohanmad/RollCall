# RollCall

Camera roll → suggested memories → share with friends.

Expo (SDK 57) + React Native app. Photos are clustered into drafts; you review, post, and engage. With Supabase configured, auth, feed, friends, likes/comments, and notifications sync to the cloud.

## Setup

```bash
npm install
cp .env.example .env
npm run ios   # or: npm start
```

Works offline with local auth. For cloud features, fill `.env` and run `supabase/schema.sql` in the Supabase SQL editor (or the additive `friends.sql` / `engagement.sql` / `notifications.sql` if you already ran an older schema).

| Env | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Auth, storage, social graph, feed |
| `EXPO_PUBLIC_OPENAI_API_KEY` | Optional vision titles + cover picks (`gpt-4o-mini`) |

## What’s in the app

- **Create** — incremental camera-roll scan, spatiotemporal clusters, place labels, heuristic or vision titles/covers
- **Memories** — friends-only feed (your posts live on Profile)
- **Profile** — memory grid, friends/search/invites, notifications bell
- **Social** — friend requests, likes, comments, in-app notifications
- **Sync** — optimistic post + background upload/retry to Supabase Storage + `memories`

## Stack

TypeScript · Expo 57 · React Navigation · AsyncStorage · Supabase (Auth, Postgres/RLS, Storage) · optional OpenAI Vision

Product notes: [PLAN.md](./PLAN.md) · Repo: https://github.com/rohanmad/RollCall
