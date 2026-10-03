ALTER TABLE "cash_shifts" ADD COLUMN "opening_cash_usd_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "opening_cash_ves_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "expected" jsonb;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "counted" jsonb;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD COLUMN "closed_by" jsonb;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_opening_nonnegative" CHECK ("cash_shifts"."opening_cash_usd_micros" >= 0 and "cash_shifts"."opening_cash_ves_micros" >= 0);