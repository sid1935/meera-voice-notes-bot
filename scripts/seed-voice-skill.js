// Pushes the current config/voice-instructions.txt content into the
// voice_skill table as its first (or newest) version. Run this once after
// setting up Supabase, and again any time you want the table's history to
// reflect a manual edit to the file.
//
// Usage: npm run seed-voice-skill
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveVoiceSkill } from "../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_INSTRUCTIONS_PATH = path.join(
  __dirname,
  "../config/voice-instructions.txt"
);

async function main() {
  const content = readFileSync(VOICE_INSTRUCTIONS_PATH, "utf-8").trim();
  const row = await saveVoiceSkill(content);
  console.log(`Seeded voice_skill (id ${row.id}) from ${VOICE_INSTRUCTIONS_PATH}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
