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

const KEYWORDS_PROMPT = `You extract search terms from a founder's note so it can be checked against current news coverage.

Pull 3-5 specific keywords or named entities from the note — product names,
industry terms, places, companies, events, whatever would find a genuinely
related news article. Then combine them into a single short search-engine
style phrase most likely to surface a directly relevant news story. If the
note has no clear newsworthy topic, still return your best-guess phrase.`;

const KEYWORDS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "3-5 search keywords pulled from the note",
    },
    searchPhrase: {
      type: SchemaType.STRING,
      description: "a short search-engine-style phrase combining the keywords",
    },
  },
  required: ["keywords", "searchPhrase"],
};

export async function extractSearchPhrase(noteText) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: KEYWORDS_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: KEYWORDS_SCHEMA,
    },
  });

  const result = await model.generateContent(noteText);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON for keyword extraction: ${text}`);
  }

  const searchPhrase = String(parsed.searchPhrase || "").trim();
  if (!searchPhrase) {
    throw new Error("Gemini did not return a search phrase");
  }

  return {
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    searchPhrase,
  };
}

const DRAFT_WITH_NEWS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    draft: { type: SchemaType.STRING, description: "the finished draft post" },
    usedNewsItem: {
      type: SchemaType.BOOLEAN,
      description:
        "true only if the draft actually references or builds on the supplied news item",
    },
  },
  required: ["draft", "usedNewsItem"],
};

export async function draftPost(noteText, newsItem = null) {
  const genAI = getClient();
  const basePrompt = buildSystemPrompt();

  if (!newsItem) {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: basePrompt,
    });

    const result = await model.generateContent(noteText);
    const text = result.response.text();

    if (!text || !text.trim()) {
      throw new Error("Gemini returned an empty response");
    }

    return { draft: text.trim(), usedNewsItem: false };
  }

  const systemInstruction = `${basePrompt}

--- POSSIBLY RELEVANT NEWS ITEM ---
Headline: ${newsItem.headline}
Source: ${newsItem.source}
Date: ${newsItem.date || "unknown"}
Summary: ${newsItem.summary}
--- END NEWS ITEM ---

If this news item is genuinely relevant, use it to make the post timely. If
it doesn't fit naturally, ignore it. Set usedNewsItem to true only if the
draft actually references or builds on this news item — not merely because
it exists.`;

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DRAFT_WITH_NEWS_SCHEMA,
    },
  });

  const result = await model.generateContent(noteText);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON for drafting: ${text}`);
  }

  const draft = String(parsed.draft || "").trim();
  if (!draft) {
    throw new Error("Gemini returned an empty draft");
  }

  return { draft, usedNewsItem: Boolean(parsed.usedNewsItem) };
}
