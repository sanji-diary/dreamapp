CREATE TABLE egg_rounds (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  launch_id TEXT,
  expires_at INTEGER NOT NULL,
  result_id TEXT UNIQUE,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX egg_rounds_launch ON egg_rounds (launch_id, seq);
--> statement-breakpoint
CREATE INDEX egg_rounds_expiry ON egg_rounds (expires_at);

