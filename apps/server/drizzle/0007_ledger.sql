CREATE TABLE "customer_balances" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"money_micros" bigint DEFAULT 0 NOT NULL,
	"combo_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "customer_balances_money_nonnegative" CHECK ("customer_balances"."money_micros" >= 0),
	CONSTRAINT "customer_balances_combo_nonnegative" CHECK ("customer_balances"."combo_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"wallet" text NOT NULL,
	"amount" bigint NOT NULL,
	"kind" text NOT NULL,
	"session_id" uuid,
	"shift_id" uuid,
	"payment_method" text,
	"combo_snapshot" jsonb,
	"reason" text,
	"actor" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ledger_wallet_check" CHECK ("ledger"."wallet" in ('money', 'combo')),
	CONSTRAINT "ledger_kind_check" CHECK ("ledger"."kind" in ('recharge', 'combo_purchase', 'consumption', 'adjustment', 'migration')),
	CONSTRAINT "ledger_amount_nonzero" CHECK ("ledger"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "customer_balances" ADD CONSTRAINT "customer_balances_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_customer_created_idx" ON "ledger" USING btree ("customer_id","created_at");