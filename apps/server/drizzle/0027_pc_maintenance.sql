CREATE TABLE "pc_maintenances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pc_id" uuid NOT NULL,
	"pc_name" text NOT NULL,
	"actor" jsonb NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"exit_id" uuid,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"ended_by" jsonb,
	"exit_source" text,
	CONSTRAINT "pc_maintenances_exit_id_unique" UNIQUE("exit_id"),
	CONSTRAINT "pc_maintenances_name_check" CHECK (length("pc_maintenances"."pc_name") > 0),
	CONSTRAINT "pc_maintenances_actor_check" CHECK (coalesce("pc_maintenances"."actor"->>'kind' = 'staff', false)),
	CONSTRAINT "pc_maintenances_source_check" CHECK ("pc_maintenances"."source" in ('local', 'panel')),
	CONSTRAINT "pc_maintenances_exit_fields_check" CHECK (
      ("pc_maintenances"."ended_at" is null and "pc_maintenances"."exit_id" is null and "pc_maintenances"."duration_seconds" is null
        and "pc_maintenances"."ended_by" is null and "pc_maintenances"."exit_source" is null) or
      ("pc_maintenances"."ended_at" is not null and "pc_maintenances"."exit_id" is not null and "pc_maintenances"."duration_seconds" is not null
        and "pc_maintenances"."duration_seconds" >= 0 and "pc_maintenances"."ended_by" is not null and "pc_maintenances"."exit_source" is not null
        and coalesce("pc_maintenances"."ended_by"->>'kind' = 'staff', false) and "pc_maintenances"."exit_source" in ('local', 'panel')))
);
--> statement-breakpoint
CREATE TABLE "staff_technical_login_attempts" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	CONSTRAINT "staff_technical_login_attempts_failures_check" CHECK ("staff_technical_login_attempts"."failed_logins" between 0 and 10),
	CONSTRAINT "staff_technical_login_attempts_lock_check" CHECK (
      ("staff_technical_login_attempts"."failed_logins" < 10 and "staff_technical_login_attempts"."locked_at" is null and "staff_technical_login_attempts"."locked_until" is null) or
      ("staff_technical_login_attempts"."failed_logins" = 10 and "staff_technical_login_attempts"."locked_at" is not null and "staff_technical_login_attempts"."locked_until" is not null
        and "staff_technical_login_attempts"."locked_until" = "staff_technical_login_attempts"."locked_at" + interval '60 seconds'))
);
--> statement-breakpoint
ALTER TABLE "pc_maintenances" ADD CONSTRAINT "pc_maintenances_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_technical_login_attempts" ADD CONSTRAINT "staff_technical_login_attempts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pc_maintenances_open_idx" ON "pc_maintenances" USING btree ("pc_id") WHERE "pc_maintenances"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "pc_maintenances_pc_started_idx" ON "pc_maintenances" USING btree ("pc_id","started_at");