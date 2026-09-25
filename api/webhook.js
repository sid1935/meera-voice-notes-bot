import { scoreNote, extractSearchPhrase, draftPost } from "../lib/gemini.js";
import { fetchTopNewsArticle } from "../lib/news.js";
import { sendMessage, sendChatAction } from "../lib/telegram.js";
import {
  saveNote,
  saveDraft,
  findPendingDraft,
  updateDraftStatus,
} from "../lib/supabase.js";

const MIN_SCORE_TO_DRAFT = 6;
const REVIEW_STATUS_BY_COMMAND = { approve: "approved", reject: "rejected" };

function formatNewsFlag(newsItem) {
  return [
    "─────────────────────────────────",
    `NEWS SOURCE: ${newsItem.headline}`,
    `FROM: ${newsItem.source} · ${newsItem.date || "date unknown"}`,
    `LINK: ${newsItem.url}`,
    "⚠ Check this before publishing — you are the author of this claim",
    "─────────────────────────────────",
  ].join("\n");
}

async function handleReviewCommand(chatId, message, command) {
  const status = REVIEW_STATUS_BY_COMMAND[command];
  const replyToMessageId = message.reply_to_message?.message_id ?? null;

  try {
    const draft = await findPendingDraft({ chatId, replyToMessageId });
    if (!draft) {
      await sendMessage(
        chatId,
        "No pending draft to update — send a note first."
      );
      return;
    }

    await updateDraftStatus(draft.id, status);
    await sendMessage(
      chatId,
      status === "approved"
        ? "Marked as approved."
        : "Marked as rejected — kept on file so I can see what to improve."
    );
  } catch (err) {
    console.error("Failed to update draft status:", err);
    await sendMessage(
      chatId,
      "Couldn't update that draft's status — please try again."
    );
  }
}

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
        "Send me a note — a raw thought, an update, anything — and I'll send back a drafted post written in your voice. Reply APPROVE or REJECT to a draft to record what you thought of it."
      );
      return;
    }

    const command = text.toLowerCase();
    if (command === "approve" || command === "reject") {
      await handleReviewCommand(chatId, message, command);
      return;
    }

    await sendChatAction(chatId, "typing");

    const { score, reason } = await scoreNote(text);

    if (score < MIN_SCORE_TO_DRAFT) {
      try {
        await saveNote({
          chatId,
          telegramMessageId: message.message_id,
          text,
          score,
          reason,
          status: "rejected",
        });
      } catch (dbErr) {
        console.error("Failed to save rejected note:", dbErr);
      }

      await sendMessage(
        chatId,
        `Didn't draft this one (${score}/10) — ${reason}`
      );
      return;
    }

    let note = null;
    try {
      note = await saveNote({
        chatId,
        telegramMessageId: message.message_id,
        text,
        score,
        reason,
        status: "accepted",
      });
    } catch (dbErr) {
      console.error("Failed to save accepted note:", dbErr);
    }

    await sendChatAction(chatId, "typing");

    let newsItem = null;
    try {
      const { searchPhrase } = await extractSearchPhrase(text);
      newsItem = await fetchTopNewsArticle(searchPhrase);
    } catch (newsErr) {
      console.error("News lookup failed, continuing without it:", newsErr);
      newsItem = null;
    }

    await sendChatAction(chatId, "typing");
    const { draft, usedNewsItem } = await draftPost(text, newsItem);

    const reply =
      usedNewsItem && newsItem
        ? `${draft}\n\n${formatNewsFlag(newsItem)}`
        : draft;

    const sentMessages = await sendMessage(chatId, reply);
    const draftMessageId = sentMessages[0]?.message_id ?? null;

    if (note) {
      try {
        await saveDraft({
          noteId: note.id,
          chatId,
          draftText: draft,
          usedNewsItem: Boolean(usedNewsItem && newsItem),
          newsItem: usedNewsItem ? newsItem : null,
          telegramMessageId: draftMessageId,
        });
      } catch (dbErr) {
        console.error("Failed to save draft:", dbErr);
      }
    }
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
