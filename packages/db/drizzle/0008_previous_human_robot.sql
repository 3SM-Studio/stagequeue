CREATE TABLE "event_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "event_invites" ("event_id", "code", "status")
SELECT "events"."id", substring(md5("events"."id"::text || ':poza-nuta-invite') from 1 for 16), 'active'
FROM "events"
WHERE NOT EXISTS (
	SELECT 1 FROM "event_invites" WHERE "event_invites"."event_id" = "events"."id"
);--> statement-breakpoint
CREATE INDEX "event_invites_event_id_idx" ON "event_invites" USING btree ("event_id");
