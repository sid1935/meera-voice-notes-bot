// Registers (or deletes) the Telegram webhook so updates get sent to your
// deployed Vercel URL.
//
// Usage:
//   node scripts/set-webhook.js https://your-project.vercel.app
//   node scripts/set-webhook.js --delete
//
// Requires TELEGRAM_BOT_TOKEN in the environment. If TELEGRAM_WEBHOOK_SECRET
// is also set, it's registered with Telegram and echoed back on every
// request so api/webhook.js can verify requests really come from Telegram.

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN in your environment first.");
  process.exit(1);
}

const arg = process.argv[2];

async function main() {
  if (arg === "--delete") {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
    });
    const data = await res.json();
    console.log(data);
    return;
  }

  if (!arg) {
    console.error(
      "Usage: node scripts/set-webhook.js https://your-project.vercel.app"
    );
    process.exit(1);
  }

  const url = `${arg.replace(/\/$/, "")}/api/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      ...(secret ? { secret_token: secret } : {}),
    }),
  });
  const data = await res.json();
  console.log(data);

  if (!secret) {
    console.warn(
      "\nNote: TELEGRAM_WEBHOOK_SECRET was not set, so the webhook was " +
        "registered without a secret token. Anyone who finds your URL " +
        "could POST fake updates. Set TELEGRAM_WEBHOOK_SECRET and re-run " +
        "this script to lock it down."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
