import { scoreNote, draftPost } from "../lib/gemini.js";

const MIN_SCORE_TO_DRAFT = 6;
import { sendMessage, sendChatAction } from "../lib/telegram.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Handy for confirming the deployment is live.
    res.status(200).send("ok");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // If TELEGRAM_WEBHOOK_SECRET is set, only accept requests carrying the
  // matching secret token, which Telegram sends when you register the
  // webhook with `secret_token` (see scripts/set-webhook.js).
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.headers["x-telegram-bot-api-secret-token"];
    if (provided !== expectedSecret) {
      res.status(401).send("Unauthorized");
      return;
    }
  }

  const update = req.body;
  const message = update?.message;
  const chatId = message?.chat?.id;

  // Always 200 back to Telegram quickly so it doesn't retry the update,
  // even if we choose not to act on it.
  res.status(200).send("ok");

  if (!chatId) return;

  try {
    if (!message.text) {
      await sendMessage(
        chatId,
        "Send me a text note and I'll turn it into a draft post. (Voice messages and attachments aren't supported yet.)"
      );
      return;
    }

    const text = message.text.trim();

    if (text === "/start" || text === "/help") {
      await sendMessage(
        chatId,
        "Send me a note — a raw thought, an update, anything — and I'll send back a drafted post written in your voice."
      );
      return;
    }

    await sendChatAction(chatId, "typing");

    const { score, reason } = await scoreNote(text);
    if (score < MIN_SCORE_TO_DRAFT) {
      await sendMessage(
        chatId,
        `Didn't draft this one (${score}/10) — ${reason}`
      );
      return;
    }

    await sendChatAction(chatId, "typing");
    const draft = await draftPost(text);
    await sendMessage(chatId, draft);
  } catch (err) {
    console.error("Failed to process update:", err);
    try {
      await sendMessage(
        chatId,
        "Something went wrong drafting that one — please try again in a bit."
      );
    } catch (sendErr) {
      console.error("Failed to send error message:", sendErr);
    }
  }
}
