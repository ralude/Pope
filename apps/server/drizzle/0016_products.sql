CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_micros" bigint NOT NULL,
	"min_stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"photo" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price_micros" > 0),
	CONSTRAINT "products_min_stock_nonnegative" CHECK ("products"."min_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_concepts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit_price_micros" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sale_concepts_price_positive" CHECK ("sale_concepts"."unit_price_micros" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"sale_id" uuid,
	"actor" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('restock', 'sale', 'adjustment', 'waste')),
	CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("stock_movements"."quantity" <> 0),
	CONSTRAINT "stock_movements_kind_fields" CHECK (("stock_movements"."kind" = 'restock' and "stock_movements"."quantity" > 0 and "stock_movements"."sale_id" is null)
        or ("stock_movements"."kind" = 'sale' and "stock_movements"."sale_id" is not null)
        or ("stock_movements"."kind" = 'adjustment' and "stock_movements"."reason" is not null and "stock_movements"."sale_id" is null)
        or ("stock_movements"."kind" = 'waste' and "stock_movements"."quantity" < 0 and "stock_movements"."reason" is not null
          and "stock_movements"."sale_id" is null))
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_product_created_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_sale_idx" ON "stock_movements" USING btree ("sale_id");