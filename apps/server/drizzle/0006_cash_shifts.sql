CREATE TABLE "cash_shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "cash_shifts_closed_after_opened" CHECK ("cash_shifts"."closed_at" >= "cash_shifts"."opened_at")
);
--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_shifts_open_staff_idx" ON "cash_shifts" USING btree ("staff_id") WHERE "cash_shifts"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "cash_shifts_staff_opened_idx" ON "cash_shifts" USING btree ("staff_id","opened_at");