CREATE TABLE "participant_event_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_token_hash" text NOT NULL,
	"granted_by_invite_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_event_access_event_token_unique" UNIQUE("event_id","participant_token_hash")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "join_access_mode" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_join_access_mode_check" CHECK ("events"."join_access_mode" in ('open', 'invite_required'));--> statement-breakpoint
ALTER TABLE "participant_event_access" ADD CONSTRAINT "participant_event_access_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_event_access" ADD CONSTRAINT "participant_event_access_granted_by_invite_id_event_invites_id_fk" FOREIGN KEY ("granted_by_invite_id") REFERENCES "public"."event_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_event_access_event_id_idx" ON "participant_event_access" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participant_event_access_invite_id_idx" ON "participant_event_access" USING btree ("granted_by_invite_id");
