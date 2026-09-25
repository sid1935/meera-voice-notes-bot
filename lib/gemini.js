import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_INSTRUCTIONS_PATH = path.join(
  __dirname,
  "../config/voice-instructions.txt"
);

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.8-flash";

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

const SCORING_PROMPT = `You triage a founder's raw, informal notes before they get turned into drafted posts.

Score the note from 0 to 10 on how worth drafting into a post it is: does it
contain a real idea, story, opinion, or specific detail that could become a
genuine post? Logistics reminders, to-do/task notes, calendar pings, and
abandoned half-finished thoughts with no real substance should score low
(0-3). Notes with a clear idea, anecdote, opinion, or specific detail worth
expanding should score high (6-10). Borderline notes score in the middle
(4-5).

Give a one-line reason for the score, written as if explaining to the
founder why this one wasn't (or was) worth drafting.`;

const SCORE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    score: {
      type: SchemaType.INTEGER,
      description: "0-10 rating of how worth drafting into a post the note is",
    },
    reason: {
      type: SchemaType.STRING,
      description: "one-line reason for the score",
    },
  },
  required: ["score", "reason"],
};

export async function scoreNote(noteText) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SCORING_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCORE_SCHEMA,
    },
  });

  const result = await model.generateContent(noteText);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON for scoring: ${text}`);
  }

  const score = Math.round(Number(parsed.score));
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error(`Gemini returned an invalid score: ${JSON.stringify(parsed)}`);
  }

  return { score, reason: String(parsed.reason || "").trim() };
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
