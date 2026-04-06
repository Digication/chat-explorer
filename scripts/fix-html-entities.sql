-- Fix HTML entities in existing comment text
-- Run this once against the database to clean up previously imported data.
--
-- Usage (from inside the Docker container):
--   psql "$DATABASE_URL" -f scripts/fix-html-entities.sql
--
-- This is safe to run multiple times — it only updates rows that contain
-- the encoded entities, and the replacements are idempotent.

-- Apostrophes (most common issue)
UPDATE comment
SET text = REPLACE(REPLACE(text, '&#39;', ''''), '&apos;', '''')
WHERE text LIKE '%&#39;%' OR text LIKE '%&apos;%';

-- Double quotes
UPDATE comment
SET text = REPLACE(text, '&quot;', '"')
WHERE text LIKE '%&quot;%';

-- Angle brackets
UPDATE comment
SET text = REPLACE(REPLACE(text, '&lt;', '<'), '&gt;', '>')
WHERE text LIKE '%&lt;%' OR text LIKE '%&gt;%';

-- Ampersand (must run LAST since other entities contain &)
UPDATE comment
SET text = REPLACE(text, '&amp;', '&')
WHERE text LIKE '%&amp;%';
