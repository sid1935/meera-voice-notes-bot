-- Memory layer for the voice notes bot: every incoming note, every draft
-- generated from it, and a history of the voice-skill instructions used to
-- generate drafts. Nothing here is ever deleted by the app — rejected
-- notes and rejected drafts stay in place so they can be reviewed later.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- against a fresh project.

create extension if not exists "pgcrypto";

-- Every note that reaches the scoring step, whether or not it goes on to
-- be drafted.
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  telegram_message_id bigint,
  text text not null,
  score integer,
  score_reason text,
  -- 'accepted'  = score >= 6, a draft was generated
  -- 'rejected'  = score < 6, no draft was generated
  status text not null check (status in ('accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists notes_chat_id_idx on notes (telegram_chat_id);

-- One row per draft generated from an accepted note.
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes (id) on delete cascade,
  telegram_chat_id bigint not null,
  -- message_id of the Telegram message the draft was sent in, so a later
  -- APPROVE/REJECT reply can be matched back to this row.
  telegram_message_id bigint,
  draft_text text not null,
  used_news_item boolean not null default false,
  news_headline text,
  news_source text,
  news_date text,
  news_url text,
  -- 'pending'   = sent to Meera, awaiting her APPROVE/REJECT
  -- 'approved'  = she replied APPROVE
  -- 'rejected'  = she replied REJECT
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drafts_chat_status_idx on drafts (telegram_chat_id, status);
create index if not exists drafts_telegram_message_id_idx on drafts (telegram_message_id);

-- History of the writing-voice instructions used to generate drafts.
-- The most recent row (by created_at) is the active version.
create table if not exists voice_skill (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);
