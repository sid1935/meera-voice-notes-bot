import { createClient } from "@supabase/supabase-js";

let client;
function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set"
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export async function saveNote({
  chatId,
  telegramMessageId,
  text,
  score,
  reason,
  status,
}) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      telegram_chat_id: chatId,
      telegram_message_id: telegramMessageId ?? null,
      text,
      score,
      score_reason: reason,
      status,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save note: ${error.message}`);
  return data;
}

export async function saveDraft({
  noteId,
  chatId,
  draftText,
  usedNewsItem,
  newsItem,
  telegramMessageId,
}) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("drafts")
    .insert({
      note_id: noteId,
      telegram_chat_id: chatId,
      telegram_message_id: telegramMessageId ?? null,
      draft_text: draftText,
      used_news_item: Boolean(usedNewsItem),
      news_headline: newsItem?.headline ?? null,
      news_source: newsItem?.source ?? null,
      news_date: newsItem?.date ?? null,
      news_url: newsItem?.url ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save draft: ${error.message}`);
  return data;
}

// Finds the draft a Meera's APPROVE/REJECT reply refers to. If she replied
// directly to the draft message, match on that message id exactly.
// Otherwise fall back to the most recent pending draft in the chat.
export async function findPendingDraft({ chatId, replyToMessageId }) {
  const supabase = getClient();
  let query = supabase
    .from("drafts")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .eq("status", "pending");

  if (replyToMessageId) {
    query = query.eq("telegram_message_id", replyToMessageId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to look up pending draft: ${error.message}`);
  return data?.[0] ?? null;
}

export async function updateDraftStatus(draftId, status) {
  const supabase = getClient();
  const { error } = await supabase
    .from("drafts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", draftId);

  if (error) throw new Error(`Failed to update draft status: ${error.message}`);
}

export async function saveVoiceSkill(content) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("voice_skill")
    .insert({ content })
    .select()
    .single();

  if (error) throw new Error(`Failed to save voice skill: ${error.message}`);
  return data;
}
