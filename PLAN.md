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
- Set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` and run `supabase/schema.sql` for production Auth
- See `.env.example`

## Upcoming

- AI titles / captions / smarter cover selection
- Wire invites to real backend

## Memory pipeline (v1)

- `src/lib/memoryPipeline` — camera-roll fetch → cluster → persist candidates
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
