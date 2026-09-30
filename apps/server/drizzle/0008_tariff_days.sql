CREATE TABLE "tariff_days" (
	"weekday" integer PRIMARY KEY NOT NULL,
	"rate_micros_per_hour" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" jsonb,
	CONSTRAINT "tariff_days_weekday_check" CHECK ("tariff_days"."weekday" between 1 and 7),
	CONSTRAINT "tariff_days_rate_positive" CHECK ("tariff_days"."rate_micros_per_hour" > 0)
);
--> statement-breakpoint
-- Tarifa inicial (REQ-001-10): lunes a miércoles 1,50 USD/h y jueves a domingo 2,00 USD/h.
INSERT INTO "tariff_days" ("weekday", "rate_micros_per_hour") VALUES
	(1, 1500000), (2, 1500000), (3, 1500000),
	(4, 2000000), (5, 2000000), (6, 2000000), (7, 2000000);
