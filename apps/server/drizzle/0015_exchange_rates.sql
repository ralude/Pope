CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ves_per_usd" bigint NOT NULL,
	"effective_date" date NOT NULL,
	"source" text NOT NULL,
	"obtained_at" timestamp with time zone NOT NULL,
	"actor" jsonb NOT NULL,
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."ves_per_usd" > 0)
);
--> statement-breakpoint
CREATE INDEX "exchange_rates_effective_idx" ON "exchange_rates" USING btree ("effective_date","obtained_at");