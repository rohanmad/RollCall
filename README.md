# RollCall

Your life, beautifully organized.

## One-liner

RollCall turns your camera roll into a calm **timeline of memories**. Posts are AI-suggested from your photos — you never manually create content.

## Design

Soft off-white, floating memory cards, lots of whitespace. Inspired by Apple Photos / Notion / Airbnb — not Instagram.

See [PLAN.md](./PLAN.md) for full product and build order.

## Run

```bash
npm install
cp .env.example .env   # optional: add Supabase keys for cloud auth
npm start
```

On first launch you’ll see Welcome → create an account (works locally without Supabase).

## Auth

- Sign up / sign in / sign out / forgot password / session restore
- Onboarding: photos permission, invite friends, magical timeline loading
- Production: fill `.env` and apply `supabase/schema.sql`

See [PLAN.md](./PLAN.md) for product details.

## Repo

https://github.com/rohanmad/RollCall
