# RollCall — Product & Architecture Plan

Living plan. UI and social flows first; camera roll + AI grouping last.

## Product one-liner

RollCall turns your camera roll into a **beautiful timeline of life**. Users never manually create posts — memories are AI-generated from recent photos and grouped into events.

> “This is your life, beautifully organized.”

## Design philosophy

- **Memories, not content creation**
- Do **not** copy Instagram layout, spacing, or chrome
- Inspiration: Apple Photos, Arc, Notion, Airbnb, BeReal (minimalism only)
- Soft off-white (`#F7F7F5`), large rounded cards (28px), floating shadows, whitespace
- Photos are the hero; calm typography; minimal chrome

## Memory Card

- Large cover — **swipe** through photos
- AI title + location (no captions / tags for now)
- Meta: avatar · name · date · location
- Reactions: **Like** · **Comment** only (no Share button)

## Screens

| Tab | Job |
| --- | --- |
| **Memories** | Timeline of posted memories from you + friends |
| **For you** | Suggested memories — remove photos, edit title/location, **Post memory** |
| **Discover** | Memories from **non-friends** posted **near you** |
| **Profile** | Memory grid; friend count; invite badge; friend icon if connected |

## Auth & onboarding

- Welcome → Sign Up / Sign In → Photo permission → Invite friends → Magic loading → Main app
- Local auth works out of the box (persisted, unique email/username, hashed passwords)
- Set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` and run `supabase/schema.sql` for Auth + Memories
- See `.env.example`

## Upcoming

- Discover feed from nearby non-friends
- Realtime / push notification delivery
- Proxy OpenAI vision through a backend (key is client-side for demos)

## Vision titles & covers

- With `EXPO_PUBLIC_OPENAI_API_KEY`, drafts use GPT vision (`gpt-4o-mini` by default)
- Shortlists top heuristic cover candidates, then vision picks cover + 2–5 word title
- Falls back to local heuristics when the key is missing or the call fails

## Notifications (Supabase)

- Table: `notifications` (`friend_request`, `friend_accepted`, `friend_memory`, `memory_liked`, `memory_commented`)
- Client: `src/lib/notifications` — create/list/mark read + event bus for future push
- Emitted from friends / engagement / publish paths
- Profile bell → Notifications screen; unread badge; tap navigates to profile or MemoryFocus
- Additive: `supabase/notifications.sql`

## Friends feed (Supabase)

- Memories tab loads friend memories only (`src/lib/memories/friendsFeed.ts`)
- Own posts stay on Profile; pull-to-refresh on FeedScreen
- Delete removes the Supabase `memories` row (likes/comments cascade)

## Friends (Supabase)

- Tables: `friend_requests` (pending|accepted|declined|canceled) + `friendships` (canonical `user_a < user_b`)
- Client: `src/lib/friends` — search, send/accept/decline/cancel, remove, hydrate
- `subscribeFriendEvents` for future notifications
- AppState hydrates on login; optimistic invite actions; username search via `profiles`
- Additive migration: `supabase/friends.sql` (also in `schema.sql`)

## Likes & comments (Supabase)

- Tables: `likes` + `comments`; `memories.likes_count` / `comments_count` via triggers
- Client: `src/lib/engagement` — toggle like, add comment, load on MemoryFocus open
- Optimistic UI; synced memories only; additive `supabase/engagement.sql`

## Memories (Supabase)

Posted memories sync to the `memories` table:

| Column | App field |
| --- | --- |
| id | id |
| owner_id | ownerId |
| title | title |
| cover_photo | coverPhoto (public URL) |
| photos | photos (URL[]) |
| location | location |
| created_at | createdAt |
| likes_count | likesCount |
| comments_count | commentsCount |

- Photos upload to Storage bucket `memory-photos`
- Posting stays optimistic locally; `src/lib/memories` uploads in the background
- Failures mark the post as `failed` with an in-card **Retry**
- Without Supabase env, posting stays local-only (`local_only`)

Run the full `supabase/schema.sql` in the SQL editor after setting `.env`.

## Memory pipeline (v1)

```
Camera Roll → Cluster photos → Choose Cover → Generate Title → Memory Draft
```

Modules (each swappable):

- `clusterMoments` — time/GPS photo clusters
- `selectCoverPhoto` / `rankCoverPhotos` — heuristic cover shortlist
- `enrichMemoryWithVision` — optional OpenAI vision title + cover
- `resolvePlace` — reverse-geocode → location label
- `generateMemoryTitle` — heuristic 2–5 word titles (fallback)
- `createMemoryDraft` — assembles `Moment` for For you

Also:

- Runs after onboarding (Magic Loading) and on app foreground
- Incremental: only media newer than `lastScannedAt` (30-day lookback on first scan)
- Candidates appear as drafts in **For you** — never auto-posted
- Posted memories persist locally (`rollcall.postedMemories.v1`) across restarts

## Done recently

- Tap author on a memory card → full profile
- For you: remove photos, edit title/location, **Post memory**
- Tags / captions removed for now
- Other profiles show friend count + small friend icon if connected
- Comment opens focused memory view
- User search in Friends sheet
- Settings: username, password, bio, log out; tap avatar to edit photo
- Camera-roll memory detection pipeline
- Local persistence for posted memories (moments, posts, photo snapshots)

## Social model

- Mutual invites → friends
- Keeping a memory shares it with friends
- Discover is ambient / area — separate from your friend graph
