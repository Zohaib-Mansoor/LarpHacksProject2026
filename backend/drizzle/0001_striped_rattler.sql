CREATE TABLE "media_cleanup_jobs" (
	"round_id" uuid PRIMARY KEY NOT NULL,
	"room_name" text NOT NULL,
	"close_until" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "media_cleanup_due_idx" ON "media_cleanup_jobs" USING btree ("next_attempt_at");