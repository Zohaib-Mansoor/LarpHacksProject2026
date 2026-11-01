CREATE TABLE "voice_rating_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"round" integer NOT NULL,
	"role" text NOT NULL,
	"user_id" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"next_dispatch_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"run_id" text,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_rating_jobs" ADD CONSTRAINT "voice_rating_jobs_code_voice_rooms_code_fk" FOREIGN KEY ("code") REFERENCES "public"."voice_rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_rating_jobs" ADD CONSTRAINT "voice_rating_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_rating_round_user_idx" ON "voice_rating_jobs" USING btree ("code","round","user_id");--> statement-breakpoint
CREATE INDEX "voice_rating_dispatch_idx" ON "voice_rating_jobs" USING btree ("status","next_dispatch_at");