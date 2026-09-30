CREATE TABLE "session_topups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"seconds" integer NOT NULL,
	"amount_micros" bigint NOT NULL,
	"payment_method" text NOT NULL,
	"shift_id" uuid NOT NULL,
	"actor" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_topups_seconds_positive" CHECK ("session_topups"."seconds" > 0),
	CONSTRAINT "session_topups_amount_positive" CHECK ("session_topups"."amount_micros" > 0)
);
--> statement-breakpoint
ALTER TABLE "session_topups" ADD CONSTRAINT "session_topups_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_topups" ADD CONSTRAINT "session_topups_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_topups_session_idx" ON "session_topups" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "session_topups_shift_idx" ON "session_topups" USING btree ("shift_id");