CREATE TABLE "platform_support_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"target_event_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"permission" text NOT NULL,
	"access_type" text DEFAULT 'platform_owner_support' NOT NULL,
	"outcome" text DEFAULT 'allowed' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_support_audit_events" ADD CONSTRAINT "platform_support_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_support_audit_events" ADD CONSTRAINT "platform_support_audit_events_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_support_audit_events_actor_created_at_idx" ON "platform_support_audit_events" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_support_audit_events_event_created_at_idx" ON "platform_support_audit_events" USING btree ("target_event_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_support_audit_events_access_type_idx" ON "platform_support_audit_events" USING btree ("access_type");