CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shift_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid NOT NULL,
	"report_group" text NOT NULL,
	"method" text NOT NULL,
	"currency" text NOT NULL,
	"amount_micros" bigint NOT NULL,
	"usd_micros" bigint NOT NULL,
	"ves_rate" bigint,
	"description" text NOT NULL,
	"actor" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cash_entries_source_check" CHECK ("cash_entries"."source" in ('sale', 'recharge', 'temporary', 'combo', 'void')),
	CONSTRAINT "cash_entries_group_check" CHECK ("cash_entries"."report_group" in ('pc', 'snacks', 'other')),
	CONSTRAINT "cash_entries_method_check" CHECK ("cash_entries"."method" in ('cash_usd', 'cash_ves', 'mobile_payment', 'pos', 'balance')),
	CONSTRAINT "cash_entries_currency_check" CHECK ("cash_entries"."currency" in ('USD', 'VES')),
	CONSTRAINT "cash_entries_amounts" CHECK ("cash_entries"."amount_micros" <> 0 and sign("cash_entries"."amount_micros") = sign("cash_entries"."usd_micros")),
	CONSTRAINT "cash_entries_rate" CHECK (("cash_entries"."currency" = 'VES') = ("cash_entries"."ves_rate" is not null) and ("cash_entries"."ves_rate" is null or "cash_entries"."ves_rate" > 0)),
	CONSTRAINT "cash_entries_balance_usd" CHECK ("cash_entries"."method" <> 'balance' or "cash_entries"."currency" = 'USD')
);
--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entries_shift_created_idx" ON "cash_entries" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE INDEX "cash_entries_source_idx" ON "cash_entries" USING btree ("source","source_id");--> statement-breakpoint
-- Cobros anteriores a la spec 005 (plan 005, "Cobros anteriores"): pasan al registro en USD y
-- sin tasa, que entonces no se guardaba, para que la lista y los reportes estén completos.
-- Cada fila reutiliza el id de su origen (UUIDv7), que es único en su tabla.
INSERT INTO "cash_entries" ("id", "shift_id", "source", "source_id", "report_group", "method", "currency", "amount_micros", "usd_micros", "ves_rate", "description", "actor", "created_at")
SELECT l."id", l."shift_id", 'recharge', l."id", 'pc', l."payment_method", 'USD', l."amount", l."amount", NULL, 'Recarga · ' || c."username", l."actor", l."created_at"
FROM "ledger" l JOIN "customers" c ON c."id" = l."customer_id"
WHERE l."kind" = 'recharge' AND l."shift_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "cash_entries" ("id", "shift_id", "source", "source_id", "report_group", "method", "currency", "amount_micros", "usd_micros", "ves_rate", "description", "actor", "created_at")
SELECT l."id", l."shift_id", 'combo', l."id", 'pc', l."payment_method", 'USD', (l."combo_snapshot"->>'priceMicros')::bigint, (l."combo_snapshot"->>'priceMicros')::bigint, NULL, (l."combo_snapshot"->>'name') || ' · ' || c."username", l."actor", l."created_at"
FROM "ledger" l JOIN "customers" c ON c."id" = l."customer_id"
WHERE l."kind" = 'combo_purchase' AND l."wallet" = 'combo' AND l."shift_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "cash_entries" ("id", "shift_id", "source", "source_id", "report_group", "method", "currency", "amount_micros", "usd_micros", "ves_rate", "description", "actor", "created_at")
SELECT t."id", t."shift_id", 'temporary', t."id", 'pc', t."payment_method", 'USD', t."amount_micros", t."amount_micros", NULL,
  CASE WHEN t."created_at" = s."started_at" THEN 'Sesión temporal' ELSE 'Más tiempo' END || ' · ' || p."name" || ' · ' || s."temp_name",
  t."actor", t."created_at"
FROM "session_topups" t JOIN "sessions" s ON s."id" = t."session_id" JOIN "pcs" p ON p."id" = s."pc_id";
