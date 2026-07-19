BEGIN;

ALTER TABLE search_tasks
  ADD COLUMN IF NOT EXISTS source_clue_id uuid REFERENCES clues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_search_tasks_source_clue_id ON search_tasks(source_clue_id);

COMMIT;
