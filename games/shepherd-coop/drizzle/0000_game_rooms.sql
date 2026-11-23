CREATE TABLE game_rooms (code TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, touched INTEGER NOT NULL, payload TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX game_rooms_touched ON game_rooms (touched);
