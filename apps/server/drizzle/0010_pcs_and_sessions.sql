CREATE TABLE "pcs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pc_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"customer_id" uuid,
	"temp_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"rate_micros_per_hour" bigint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"opened_by" jsonb NOT NULL,
	"restored_from" uuid,
	"combo_seconds_used" integer DEFAULT 0 NOT NULL,
	"money_seconds" integer DEFAULT 0 NOT NULL,
	"money_charged_micros" bigint DEFAULT 0 NOT NULL,
	"purchased_seconds" integer,
	"used_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sessions_kind_check" CHECK ("sessions"."kind" in ('account', 'temporary')),
	CONSTRAINT "sessions_status_check" CHECK ("sessions"."status" in ('active', 'ended')),
	CONSTRAINT "sessions_kind_fields" CHECK (("sessions"."kind" = 'account' and "sessions"."customer_id" is not null and "sessions"."purchased_seconds" is null)
        or ("sessions"."kind" = 'temporary' and "sessions"."customer_id" is null and "sessions"."temp_name" is not null
          and "sessions"."purchased_seconds" is not null)),
	CONSTRAINT "sessions_ended_fields" CHECK (("sessions"."status" = 'active') = ("sessions"."ended_at" is null and "sessions"."end_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_restored_from_sessions_id_fk" FOREIGN KEY ("restored_from") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pcs_name_lower_idx" ON "pcs" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_customer_idx" ON "sessions" USING btree ("customer_id") WHERE "sessions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_pc_idx" ON "sessions" USING btree ("pc_id") WHERE "sessions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_restored_from_idx" ON "sessions" USING btree ("restored_from") WHERE "sessions"."restored_from" is not null;--> statement-breakpoint
CREATE INDEX "sessions_pc_started_idx" ON "sessions" USING btree ("pc_id","started_at");--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;