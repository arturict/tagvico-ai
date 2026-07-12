CREATE TABLE IF NOT EXISTS heartbeats (
  monthly_id TEXT NOT NULL,
  daily_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  version TEXT NOT NULL,
  documents_processed TEXT NOT NULL,
  write_mode TEXT NOT NULL,
  provider_category TEXT NOT NULL,
  ocr_rescue INTEGER NOT NULL,
  custom_fields INTEGER NOT NULL,
  controlled_tags INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_day ON heartbeats(day);
CREATE INDEX IF NOT EXISTS idx_heartbeats_month ON heartbeats(month, monthly_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_received ON heartbeats(received_at);
