CREATE TABLE "session_pauses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"max_until" timestamp with time zone NOT NULL,
	"billing_resumed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"started_by" jsonb NOT NULL,
	"ended_by" jsonb,
	CONSTRAINT "session_pauses_max_until_check" CHECK ("session_pauses"."max_until" > "session_pauses"."started_at"),
	CONSTRAINT "session_pauses_billing_check" CHECK ("session_pauses"."billing_resumed_at" is null or "session_pauses"."billing_resumed_at" >= "session_pauses"."max_until"),
	CONSTRAINT "session_pauses_end_reason_check" CHECK ("session_pauses"."end_reason" in ('resumed', 'staff_resumed', 'expired_closed', 'session_closed')),
	CONSTRAINT "session_pauses_ended_fields" CHECK (("session_pauses"."ended_at" is null) = ("session_pauses"."end_reason" is null)
        and ("session_pauses"."ended_at" is null) = ("session_pauses"."ended_by" is null))
);
--> statement-breakpoint
ALTER TABLE "session_pauses" ADD CONSTRAINT "session_pauses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_pauses" ADD CONSTRAINT "session_pauses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_pauses_open_idx" ON "session_pauses" USING btree ("session_id") WHERE "session_pauses"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "session_pauses_session_idx" ON "session_pauses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_pauses_customer_started_idx" ON "session_pauses" USING btree ("customer_id","started_at");