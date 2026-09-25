# Meera's Voice Notes Bot

Meera texts a note to a Telegram bot. Gemini scores the note on whether it's
worth drafting (logistics reminders and abandoned thoughts get filtered
out). If it passes, the bot looks for a relevant, current news item and
hands it to Gemini alongside the note and Meera's voice instructions —
Gemini only works it into the draft if it's genuinely relevant. The draft
comes back in the same chat, with a verify-flag block attached whenever a
news claim was used. Every note and draft is saved to Supabase, and Meera
can reply APPROVE or REJECT to a draft to record what she thought of it.

## How it works

```
Telegram message
  → Gemini scores the note (0-10)
      → below 6: note saved as "rejected", rejection message sent back, stop
      → 6 or above: note saved as "accepted", continue
  → Gemini extracts a search phrase from the note
  → Google News RSS is searched for that phrase (free, no key/account)
  → Gemini drafts the post, using the top news result only if it's genuinely relevant
  → if the news item was used, a NEWS SOURCE / verify-before-publishing block is appended
  → draft saved to Supabase with status "pending"
  → Telegram reply
  → later: Meera replies APPROVE or REJECT → that draft's status is updated
```

- `api/webhook.js` — the serverless function Telegram calls on every message; runs the full pipeline above.
- `lib/gemini.js` — scores each note, extracts a news search phrase, and drafts the post (optionally incorporating a news item), all via Gemini.
- `lib/news.js` — searches Google News' public RSS feed and returns the top result's headline, source, date, link, and a one-line summary. No API key or account needed.
- `lib/telegram.js` — sends messages back via the Telegram Bot API.
- `lib/supabase.js` — saves notes and drafts, and looks up/updates a draft's status when Meera replies APPROVE or REJECT.
- `config/voice-instructions.txt` — **edit this** with Meera's actual writing-voice instructions. It's a plain text file, read fresh on every draft — no code to touch, just redeploy after editing it.
- `supabase/schema.sql` — the three tables (see below). Run once in your Supabase project.
- `scripts/set-webhook.js` — one-time script to point Telegram at your deployed URL.
- `scripts/seed-voice-skill.js` — one-time (or as-needed) script to record the current voice instructions into the `voice_skill` table's history.

## The memory layer

Three tables in Supabase, defined in [`supabase/schema.sql`](supabase/schema.sql):

- **`notes`** — every note that reaches the scoring step. `status` is `accepted` (score ≥ 6, went on to be drafted) or `rejected` (score < 6, no draft made). Nothing is ever deleted, so rejected notes stay visible — they show what's not landing.
- **`drafts`** — one row per draft generated from an accepted note, including whether/which news item was used. `status` starts as `pending`, then becomes `approved` or `rejected` once Meera replies. Rejected drafts are kept, not deleted, for the same reason.
- **`voice_skill`** — a history of the writing-voice instructions used to generate drafts. The bot itself doesn't read from this table (it reads `config/voice-instructions.txt` directly, redeployed on change) — this table exists as a record of what instructions were active over time. Run `npm run seed-voice-skill` after editing the file to log a new version.

### Approving or rejecting a draft

After the bot sends a draft, reply to that message with **APPROVE** or
**REJECT** (case-insensitive) — replying directly to the draft message
matches it exactly; without a reply, the most recent pending draft in that
chat is updated instead.

### The verify-flag block

Any draft that actually uses a news item gets this appended automatically —
this is not optional, since a fact published in Meera's name that she
hasn't personally checked is exactly the failure this pipeline exists to
prevent:

```
─────────────────────────────────
NEWS SOURCE: [headline]
FROM: [publication] · [date]
LINK: [url]
⚠ Check this before publishing — you are the author of this claim
─────────────────────────────────
```

If the news lookup fails (timeout, no results) or Gemini judges the top
result isn't a natural fit for the note, drafting proceeds exactly as
before with no news item and no verify-flag block.

## Setup

### 1. Create the Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot` and follow the prompts.
3. Save the bot token it gives you.

### 2. Get a Gemini API key

Grab one from [Google AI Studio](https://aistudio.google.com/apikey).

### 3. Add the voice instructions

Open [`config/voice-instructions.txt`](config/voice-instructions.txt) and replace
the contents with Meera's real writing-voice guide — tone, sentence
rhythm, formatting habits, things to avoid, and a few example posts in her
voice. The more specific and example-heavy this is, the better the drafts.
Redeploy after editing it so the new version ships.

### 4. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Open the SQL editor and run the contents of [`supabase/schema.sql`](supabase/schema.sql) — this creates the `notes`, `drafts`, and `voice_skill` tables.
3. From Project Settings → API, grab the **Project URL** and the **`service_role` key** (not the `anon` key — the bot needs full write access and runs entirely server-side).

### 5. Install dependencies

```bash
npm install
```

### 6. Deploy to Vercel

```bash
npx vercel
```

(or connect the repo to Vercel via the dashboard for git-based deploys).

In the Vercel project settings, add these environment variables:

- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, defaults to `gemini-3.8-flash`)
- `TELEGRAM_WEBHOOK_SECRET` (optional but recommended — any random string)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Redeploy after adding env vars so the function picks them up:

```bash
npx vercel --prod
```

### 7. Point Telegram at your deployment

Set the same environment variables locally (e.g. in a `.env` file, then load
them into your shell — or just export them inline), then run:

```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=xxx node scripts/set-webhook.js https://your-project.vercel.app
```

You should see `{ ok: true, result: true, ... }` printed back.

### 8. Try it

Message your bot on Telegram with a raw note. It should reply with a typing
indicator and then a drafted post.

## Notes

- Only text messages are handled; voice messages/attachments get a polite
  "not supported yet" reply.
- Long drafts are automatically split across multiple Telegram messages
  (4096-char limit per message).
- If `TELEGRAM_WEBHOOK_SECRET` is set, the webhook rejects any request that
  doesn't carry the matching secret header — this stops randoms from POSTing
  fake messages to your function.
- To swap the Gemini model, set `GEMINI_MODEL` (e.g. to a newer/faster model
  as they become available) — no code changes needed.
