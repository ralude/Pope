CREATE TABLE "session_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"pc_id" uuid NOT NULL,
	"revoked_credential_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"started_by" jsonb NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" jsonb,
	"end_reason" text,
	CONSTRAINT "session_holds_actor_check" CHECK (coalesce("session_holds"."started_by"->>'kind' = 'staff', false)),
	CONSTRAINT "session_holds_end_check" CHECK (
      ("session_holds"."ended_at" is null and "session_holds"."ended_by" is null and "session_holds"."end_reason" is null) or
      ("session_holds"."ended_at" is not null and "session_holds"."ended_by" is not null and "session_holds"."end_reason" is not null
        and "session_holds"."end_reason" in ('continued', 'session_closed')
        and "session_holds"."ended_at" >= "session_holds"."started_at" and coalesce("session_holds"."ended_by"->>'kind' = 'staff', false)))
);
--> statement-breakpoint
ALTER TABLE "session_holds" ADD CONSTRAINT "session_holds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_holds" ADD CONSTRAINT "session_holds_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_holds" ADD CONSTRAINT "session_holds_revoked_credential_id_pc_credentials_id_fk" FOREIGN KEY ("revoked_credential_id") REFERENCES "public"."pc_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_holds_open_idx" ON "session_holds" USING btree ("session_id") WHERE "session_holds"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "session_holds_pc_idx" ON "session_holds" USING btree ("pc_id","started_at");