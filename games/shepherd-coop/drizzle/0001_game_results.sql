CREATE TABLE game_results (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id TEXT NOT NULL UNIQUE,
  launch_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  saved_count INTEGER NOT NULL CHECK (saved_count = 6),
  UNIQUE (launch_id, round_id)
);
--> statement-breakpoint
CREATE INDEX game_results_launch ON game_results (launch_id, seq);
--> statement-breakpoint
CREATE INDEX game_results_expiry ON game_results (completed_at);
--> statement-breakpoint
CREATE TRIGGER game_rooms_finished AFTER UPDATE OF payload ON game_rooms
WHEN json_extract(NEW.payload, '$.game.status') = 'won'
 AND json_extract(OLD.payload, '$.game.status') = 'playing'
 AND json_extract(NEW.payload, '$.game.savedCount') = 6
 AND json_array_length(NEW.payload, '$.members') = 2
BEGIN
  INSERT INTO game_results (result_id, launch_id, round_id, completed_at, saved_count)
    SELECT
      json_extract(NEW.payload, '$.instanceId') || ':' || json_extract(NEW.payload, '$.round') || ':p' || (member.key + 1),
      json_extract(member.value, '$.launchId'),
      json_extract(NEW.payload, '$.instanceId') || ':' || json_extract(NEW.payload, '$.round'),
      json_extract(NEW.payload, '$.game.wonAt'),
      6
    FROM json_each(NEW.payload, '$.members') AS member
    WHERE json_extract(member.value, '$.launchId') IS NOT NULL;
END;
