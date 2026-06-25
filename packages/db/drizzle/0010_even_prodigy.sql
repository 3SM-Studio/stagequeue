ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_status_check" CHECK ("access_requests"."status" in ('pending', 'approved', 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "access_requests" VALIDATE CONSTRAINT "access_requests_status_check";--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_venue_access_role_check" CHECK ("access_requests"."venue_access_role" in ('owner', 'manager', 'event_creator', 'karaoke_operator', 'viewer')) NOT VALID;--> statement-breakpoint
ALTER TABLE "access_requests" VALIDATE CONSTRAINT "access_requests_venue_access_role_check";--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_status_check" CHECK ("event_invites"."status" in ('active', 'revoked')) NOT VALID;--> statement-breakpoint
ALTER TABLE "event_invites" VALIDATE CONSTRAINT "event_invites_status_check";--> statement-breakpoint
ALTER TABLE "event_staff_assignments" ADD CONSTRAINT "event_staff_assignments_role_check" CHECK ("event_staff_assignments"."role" in ('lead_host', 'host', 'queue_operator', 'viewer')) NOT VALID;--> statement-breakpoint
ALTER TABLE "event_staff_assignments" VALIDATE CONSTRAINT "event_staff_assignments_role_check";--> statement-breakpoint
ALTER TABLE "event_staff_assignments" ADD CONSTRAINT "event_staff_assignments_status_check" CHECK ("event_staff_assignments"."status" in ('active', 'removed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "event_staff_assignments" VALIDATE CONSTRAINT "event_staff_assignments_status_check";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_status_check" CHECK ("events"."status" in ('draft', 'scheduled', 'active', 'paused', 'closed', 'archived', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "events" VALIDATE CONSTRAINT "events_status_check";--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_role_check" CHECK ("organization_memberships"."role" in ('owner', 'admin', 'booking_manager', 'host', 'operator', 'viewer')) NOT VALID;--> statement-breakpoint
ALTER TABLE "organization_memberships" VALIDATE CONSTRAINT "organization_memberships_role_check";--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_status_check" CHECK ("organization_memberships"."status" in ('invited', 'active', 'suspended', 'removed', 'disabled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "organization_memberships" VALIDATE CONSTRAINT "organization_memberships_status_check";--> statement-breakpoint
ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_role_check" CHECK ("platform_memberships"."role" in ('platform_owner', 'platform_admin')) NOT VALID;--> statement-breakpoint
ALTER TABLE "platform_memberships" VALIDATE CONSTRAINT "platform_memberships_role_check";--> statement-breakpoint
ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_status_check" CHECK ("platform_memberships"."status" in ('active', 'disabled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "platform_memberships" VALIDATE CONSTRAINT "platform_memberships_status_check";--> statement-breakpoint
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_status_check" CHECK ("song_requests"."status" in ('pending', 'approved', 'now', 'done', 'skipped', 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "song_requests" VALIDATE CONSTRAINT "song_requests_status_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('pending', 'active', 'disabled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "users" VALIDATE CONSTRAINT "users_status_check";--> statement-breakpoint
ALTER TABLE "venue_organization_access" ADD CONSTRAINT "venue_organization_access_role_check" CHECK ("venue_organization_access"."role" in ('owner', 'manager', 'event_creator', 'karaoke_operator', 'viewer')) NOT VALID;--> statement-breakpoint
ALTER TABLE "venue_organization_access" VALIDATE CONSTRAINT "venue_organization_access_role_check";--> statement-breakpoint
ALTER TABLE "venue_organization_access" ADD CONSTRAINT "venue_organization_access_status_check" CHECK ("venue_organization_access"."status" in ('pending', 'active', 'revoked', 'expired', 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "venue_organization_access" VALIDATE CONSTRAINT "venue_organization_access_status_check";--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_status_check" CHECK ("venues"."status" in ('draft', 'active', 'archived')) NOT VALID;--> statement-breakpoint
ALTER TABLE "venues" VALIDATE CONSTRAINT "venues_status_check";--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_verification_status_check" CHECK ("venues"."verification_status" in ('unclaimed', 'pending', 'verified', 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "venues" VALIDATE CONSTRAINT "venues_verification_status_check";
