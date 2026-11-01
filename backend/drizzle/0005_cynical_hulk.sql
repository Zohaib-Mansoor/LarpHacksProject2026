CREATE TABLE "voice_results" (
	"code" text NOT NULL,
	"round" integer NOT NULL,
	"user_id" text NOT NULL,
	"points" integer NOT NULL,
	"confirmed" boolean NOT NULL,
	"snapshot" jsonb NOT NULL,
	"callsign" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_results_code_round_user_id_pk" PRIMARY KEY("code","round","user_id")
);
--> statement-breakpoint
CREATE TABLE "voice_rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"player_one_id" text NOT NULL,
	"player_two_id" text,
	"state" jsonb NOT NULL,
	"sparring" boolean DEFAULT false NOT NULL,
	"queued" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "voice_rooms_distinct_users" CHECK ("voice_rooms"."player_two_id" is null or "voice_rooms"."player_one_id" <> "voice_rooms"."player_two_id")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "leaderboard_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_results" ADD CONSTRAINT "voice_results_code_voice_rooms_code_fk" FOREIGN KEY ("code") REFERENCES "public"."voice_rooms"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_results" ADD CONSTRAINT "voice_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_rooms" ADD CONSTRAINT "voice_rooms_player_one_id_user_id_fk" FOREIGN KEY ("player_one_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_rooms" ADD CONSTRAINT "voice_rooms_player_two_id_user_id_fk" FOREIGN KEY ("player_two_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_results_user_idx" ON "voice_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_rooms_queue_idx" ON "voice_rooms" USING btree ("queued","created_at");