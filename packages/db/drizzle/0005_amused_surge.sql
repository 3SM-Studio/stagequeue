WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "event_id"
      ORDER BY "position" ASC NULLS LAST, "approved_at" ASC NULLS LAST, "created_at" ASC, "id" ASC
    ) AS "new_position"
  FROM "song_requests"
  WHERE "status" = 'approved'
)
UPDATE "song_requests"
SET "position" = ranked."new_position"
FROM ranked
WHERE "song_requests"."id" = ranked."id";--> statement-breakpoint
CREATE UNIQUE INDEX "song_requests_one_approved_position_per_event_unique" ON "song_requests" USING btree ("event_id","position") WHERE "song_requests"."status" = 'approved' and "song_requests"."position" is not null;
