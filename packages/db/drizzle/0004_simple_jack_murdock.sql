ALTER TABLE "event_staff_assignments" ALTER COLUMN "role" SET DEFAULT 'queue_operator';--> statement-breakpoint
UPDATE "event_staff_assignments" SET "role" = 'queue_operator' WHERE "role" = 'operator';--> statement-breakpoint
ALTER TABLE "venue_organization_access" ALTER COLUMN "role" SET DEFAULT 'karaoke_operator';--> statement-breakpoint
UPDATE "venue_organization_access" SET "role" = 'karaoke_operator' WHERE "role" = 'operator';
