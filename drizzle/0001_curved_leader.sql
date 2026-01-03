CREATE TABLE "cameras" (
	"id" varchar PRIMARY KEY NOT NULL,
	"serial_number" varchar DEFAULT '',
	"name" varchar DEFAULT '',
	"resolution" varchar DEFAULT '',
	"fps" integer DEFAULT 0,
	"data" json DEFAULT '{}'::json
);
--> statement-breakpoint
CREATE TABLE "robots" (
	"id" varchar PRIMARY KEY NOT NULL,
	"serial_number" varchar DEFAULT '',
	"name" varchar DEFAULT '',
	"model" varchar DEFAULT '',
	"notes" text DEFAULT '',
	"data" json DEFAULT '{}'::json
);
