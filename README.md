# Life Planner

An **external executive function** app: converts goals and tasks into realistic weekly schedules, enforces capacity limits, and keeps daily planning under 5 minutes.

## Design principles

- **Max 3 cognitive-heavy (deep) blocks per day**
- **&lt;5 min daily planning** — daily view shows only 3 priority blocks + 1 optional micro task
- **Weekly auto-allocation** — fixed events → deadlines → goal quotas, with buffer
- **Forced tradeoffs** — cannot add more than capacity; must remove before adding
- **Local-first** — all data in `localStorage`, works offline

## MVP (Phase 1)

1. **Goals** — up to 3 active, with weekly quota (hours or sessions) and priority tier
2. **Tasks** — goal-linked, deadline, fixed event, location, micro; each with estimate + energy type (Deep/Light/Admin); system adds +25% buffer
3. **Capacity** — weekly discretionary hours, sleep/work windows, max deep blocks per day, max planned hours per day
4. **Weekly scheduler** — deterministic allocation; user approves or regenerates
5. **Daily view** — today’s 3 blocks + 1 micro; Start / Complete / Skip (with reason)

## Run

```bash
cd life-planner
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
```

Output in `dist/`; host anywhere for static deployment.

## Data

- **Signed out:** Stored in `localStorage` under key `life-planner-state`. No server or account required.
- **Signed in:** State syncs to Supabase (one row per user). Same data shape; accessible from any device.

## Deploy to Vercel

1. Connect the repo to [Vercel](https://vercel.com); build command `npm run build`, output directory `dist`.
2. In Project Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL` — your Supabase project URL (Project Settings → API)
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key
3. Redeploy. The app works without these (local-only); with them, users can sign in with a magic link and sync state to the cloud.

## Later phases

- **Phase 2:** Impulse tracking, skip-reason analytics
- **Phase 3:** Trading guard (checklist + emotional state before logging trades)
