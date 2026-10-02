CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"product_id" uuid,
	"concept_id" uuid,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_micros" bigint NOT NULL,
	"total_micros" bigint NOT NULL,
	CONSTRAINT "sale_lines_kind_fields" CHECK (("sale_lines"."kind" = 'product' and "sale_lines"."product_id" is not null and "sale_lines"."concept_id" is null)
        or ("sale_lines"."kind" = 'concept' and "sale_lines"."concept_id" is not null and "sale_lines"."product_id" is null)),
	CONSTRAINT "sale_lines_quantity_positive" CHECK ("sale_lines"."quantity" > 0),
	CONSTRAINT "sale_lines_price_positive" CHECK ("sale_lines"."unit_price_micros" > 0),
	CONSTRAINT "sale_lines_total" CHECK ("sale_lines"."total_micros" = "sale_lines"."quantity" * "sale_lines"."unit_price_micros")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shift_id" uuid NOT NULL,
	"customer_id" uuid,
	"total_micros" bigint NOT NULL,
	"actor" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by" jsonb,
	CONSTRAINT "sales_total_positive" CHECK ("sales"."total_micros" > 0),
	CONSTRAINT "sales_void_fields" CHECK (("sales"."voided_at" is null) = ("sales"."void_reason" is null) and ("sales"."voided_at" is null) = ("sales"."voided_by" is null))
);
--> statement-breakpoint
ALTER TABLE "ledger" DROP CONSTRAINT "ledger_kind_check";--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "sale_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_concept_id_sale_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."sale_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_lines_sale_position_idx" ON "sale_lines" USING btree ("sale_id","position");--> statement-breakpoint
CREATE INDEX "sales_shift_created_idx" ON "sales" USING btree ("shift_id","created_at");--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_kind_check" CHECK ("ledger"."kind" in ('recharge', 'combo_purchase', 'consumption', 'adjustment', 'migration', 'sale'));