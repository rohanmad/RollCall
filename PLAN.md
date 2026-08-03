# RollCall — notes

Working notes for the product as it exists now. Not a formal spec — just what we’re building and why.

## The idea

Your camera roll already has your life in it. RollCall groups recent photos into suggested memories, you tweak and post, and friends see them in a calm timeline.

No blank “create post” box. No captions/tags for now. Photos first.

> This is your life, beautifully organized.

## Feel

Quiet, spacious, Apple Photos / Notion energy — not Instagram. Soft off-white (`#F7F7F5`), big rounded cards, light shadows. Swipe through photos on a card; like and comment are enough.

## How you move through the app

1. Welcome → sign up / sign in  
2. Photo permission → invite friends → short “magic” scan  
3. Main tabs:

| Tab | What it’s for |
| --- | --- |
| **Memories** | Friends’ posts only (yours stay on Profile) |
| **Create** | Suggested drafts — edit photos/title/place, then post |
| **Discover** | Nearby non-friends — tab is there; real feed still TODO |
| **Profile** | Your grid, friends, settings, notifications bell |

## What actually ships today

**Memory pipeline**  
Camera roll → **detect events** (time + GPS, not “newest photos in a pile”) → cover → title → draft in Create. Scans after onboarding and when you come back to the app. Incremental. Nothing auto-posts.

Clustering aims for “yeah, that was one outing”: soft session gaps, location jumps start a new memory, multi-day trips in the same region stay one, screenshots / mass imports get dropped. Logic lives in `clusterMoments` so we can keep tuning it.

Titles/covers: local heuristics by default. If `EXPO_PUBLIC_OPENAI_API_KEY` is set, vision (gpt-4o-mini) refines cover + a short title; if that fails we fall back quietly.

**Posting**  
Optimistic UI, then background upload to Supabase Storage + `memories`. Retry on the card if sync fails. Works local-only without cloud env.

**Friends**  
Search by username, request / accept / decline / cancel, remove. Graph lives in Supabase (`friend_requests` + `friendships`).

**Feed**  
Memories tab = accepted friends’ memories, newest first, pull to refresh. Your posts only on Profile.

**Likes & comments**  
Shared via Supabase. Optimistic taps; full comments load when you open a memory. Counts stay in sync via DB triggers.

**Notifications**  
In-app for: friend request, accepted, friend posted, like, comment. Bell on Profile, unread styling, tap goes to the right place. Push/realtime later.

**Auth**  
Local accounts work without Supabase. With keys + `supabase/schema.sql`, you get cloud auth, profiles, storage, and the social tables. Additive SQL files exist if you set up in stages.

## Code map (rough)

- `src/lib/memoryPipeline` — scan, cluster, cover, title, vision, drafts  
- `src/lib/memories` — publish, sync queue, friends feed  
- `src/lib/friends` / `engagement` / `notifications` — social backends  
- `src/state/AppState.tsx` — most of the app glue  

## Still on the list

- Wire up Discover for real  
- Push notifications (table/client are ready to hang push off)  
- Don’t ship the OpenAI key in the client forever — proxy it  

## Social rules of thumb

Friends are mutual. Posting shares with friends. Discover (when it exists) is ambient / nearby, not your friend graph.
