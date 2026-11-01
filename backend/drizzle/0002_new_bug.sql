CREATE TABLE "round_evaluations" (
	"round_id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"feedback" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"rating" integer DEFAULT 1000 NOT NULL,
	"ranked_played" integer DEFAULT 0 NOT NULL,
	"total_rounds" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_stats_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "round_results" (
	"round_id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"ranked" integer NOT NULL,
	"players" jsonb NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rtc_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"from_seat" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"source_id" text NOT NULL,
	"text" text NOT NULL,
	"at_ms" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcript_seat" CHECK ("transcript_segments"."seat" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "transcription_leases" (
	"round_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"stream_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcription_leases_round_id_seat_pk" PRIMARY KEY("round_id","seat")
);
--> statement-breakpoint
ALTER TABLE "round_evaluations" ADD CONSTRAINT "round_evaluations_room_id_game_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_room_id_game_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtc_signals" ADD CONSTRAINT "rtc_signals_room_id_game_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_room_id_game_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_stats_rating_idx" ON "player_stats" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "rtc_round_idx" ON "rtc_signals" USING btree ("round_id","id");--> statement-breakpoint
CREATE INDEX "rtc_expiry_idx" ON "rtc_signals" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_source_idx" ON "transcript_segments" USING btree ("round_id","seat","source_id");--> statement-breakpoint
CREATE INDEX "transcript_round_idx" ON "transcript_segments" USING btree ("round_id","at_ms");--> statement-breakpoint
CREATE INDEX "transcript_expiry_idx" ON "transcript_segments" USING btree ("expires_at");