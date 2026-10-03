ALTER TABLE "cash_entries" ADD COLUMN "customer_name" text;--> statement-breakpoint
-- Spec 005, T29: la cuenta de los cobros anteriores. Las recargas y los combos apuntan a su
-- fila del ledger; las ventas y sus anulaciones, a la venta, que guarda quién pagó con saldo.
UPDATE "cash_entries" SET "customer_name" = "customers"."username" FROM "ledger" JOIN "customers" ON "customers"."id" = "ledger"."customer_id" WHERE "cash_entries"."source" IN ('recharge', 'combo') AND "cash_entries"."source_id" = "ledger"."id";--> statement-breakpoint
UPDATE "cash_entries" SET "customer_name" = "customers"."username" FROM "sales" JOIN "customers" ON "customers"."id" = "sales"."customer_id" WHERE "cash_entries"."source" IN ('sale', 'void') AND "cash_entries"."source_id" = "sales"."id";
