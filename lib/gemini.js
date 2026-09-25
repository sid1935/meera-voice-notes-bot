import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_INSTRUCTIONS_PATH = path.join(
  __dirname,
  "../config/voice-instructions.txt"
);

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function readVoiceInstructions() {
  try {
    return readFileSync(VOICE_INSTRUCTIONS_PATH, "utf-8").trim();
  } catch (err) {
    throw new Error(
      `Could not read voice instructions from ${VOICE_INSTRUCTIONS_PATH}: ${err.message}`
    );
  }
}

let client;
function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return client;
}

function buildSystemPrompt() {
  const voiceInstructions = readVoiceInstructions();
  return `You turn a founder's raw, informal note into a polished draft post.

Follow the writing-voice instructions below exactly — they describe how this
specific founder writes. Keep the founder's original meaning, facts, and
opinions intact. Do not invent details, statistics, or claims that were not
in the note. Do not add a title/headline unless the note implies one. Output
only the finished draft, with no preamble like "Here's a draft" and no
trailing commentary or notes.

--- WRITING VOICE INSTRUCTIONS ---
${voiceInstructions}
--- END WRITING VOICE INSTRUCTIONS ---`;
}

export async function draftPost(noteText) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemPrompt(),
  });

  const result = await model.generateContent(noteText);
  const text = result.response.text();

  if (!text || !text.trim()) {
    throw new Error("Gemini returned an empty response");
  }

  return text.trim();
}
