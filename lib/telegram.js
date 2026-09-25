const TELEGRAM_API = "https://api.telegram.org";

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return token;
}

async function callTelegram(method, payload) {
  const res = await fetch(`${TELEGRAM_API}/bot${getToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(
      `Telegram API error on ${method}: ${res.status} ${JSON.stringify(data)}`
    );
  }
  return data.result;
}

export async function sendMessage(chatId, text) {
  // Telegram caps messages at 4096 chars; split long drafts into chunks.
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    await callTelegram("sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
}

export async function sendChatAction(chatId, action = "typing") {
  try {
    await callTelegram("sendChatAction", { chat_id: chatId, action });
  } catch {
    // Non-critical — ignore failures here.
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}
