ALTER TABLE "catalog_import_logs" ADD CONSTRAINT "catalog_import_logs_level_check" CHECK ("catalog_import_logs"."level" in ('info', 'warn', 'error')) NOT VALID;--> statement-breakpoint
ALTER TABLE "catalog_import_logs" VALIDATE CONSTRAINT "catalog_import_logs_level_check";--> statement-breakpoint
ALTER TABLE "catalog_import_runs" ADD CONSTRAINT "catalog_import_runs_status_check" CHECK ("catalog_import_runs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "catalog_import_runs" VALIDATE CONSTRAINT "catalog_import_runs_status_check";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "jobs" VALIDATE CONSTRAINT "jobs_status_check";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_type_check" CHECK ("organizations"."type" in ('venue_owner', 'karaoke_company', 'agency', 'independent_host', 'platform')) NOT VALID;--> statement-breakpoint
ALTER TABLE "organizations" VALIDATE CONSTRAINT "organizations_type_check";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" in ('pending', 'active', 'suspended', 'archived', 'disabled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "organizations" VALIDATE CONSTRAINT "organizations_status_check";--> statement-breakpoint
ALTER TABLE "song_sources" ADD CONSTRAINT "song_sources_status_check" CHECK ("song_sources"."status" in ('active', 'disabled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "song_sources" VALIDATE CONSTRAINT "song_sources_status_check";
