# Meera's Voice Notes Bot

Meera texts a note to a Telegram bot. Gemini first scores the note on
whether it's worth drafting (logistics reminders and abandoned thoughts get
filtered out); if it scores well, Gemini drafts it into a post in Meera's
voice and sends it back in the same chat.

## How it works

```
Telegram message → Vercel function (api/webhook.js) → Gemini scores the note (0-10)
  → below 6: rejection message sent back, stop
  → 6 or above: Gemini drafts a post → Telegram reply
```

- `api/webhook.js` — the serverless function Telegram calls on every message.
- `lib/gemini.js` — scores each note (0-10, with a one-line reason) and, if it passes, builds the prompt (voice instructions + note) and calls Gemini to draft it.
- `lib/telegram.js` — sends messages back via the Telegram Bot API.
- `config/voice-instructions.txt` — **edit this** with Meera's actual writing-voice instructions. It's a plain text file, read fresh on every draft — no code to touch, just redeploy after editing it.
- `scripts/set-webhook.js` — one-time script to point Telegram at your deployed URL.

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

### 4. Install dependencies

```bash
npm install
```

### 5. Deploy to Vercel

```bash
npx vercel
```

(or connect the repo to Vercel via the dashboard for git-based deploys).

In the Vercel project settings, add these environment variables (also listed
in [`.env.example`](.env.example)):

- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, defaults to `gemini-3.8-flash`)
- `TELEGRAM_WEBHOOK_SECRET` (optional but recommended — any random string)

Redeploy after adding env vars so the function picks them up:

```bash
npx vercel --prod
```

### 6. Point Telegram at your deployment

Set the same environment variables locally (e.g. in a `.env` file, then load
them into your shell — or just export them inline), then run:

```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=xxx node scripts/set-webhook.js https://your-project.vercel.app
```

You should see `{ ok: true, result: true, ... }` printed back.

### 7. Try it

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
