ALTER TABLE "events" ADD COLUMN "public_id" text;--> statement-breakpoint
UPDATE "events"
SET "public_id" = substring(md5("id"::text || ':' || gen_random_uuid()::text), 1, 12)
WHERE "public_id" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_public_id_unique" UNIQUE("public_id");
