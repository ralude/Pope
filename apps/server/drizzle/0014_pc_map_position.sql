ALTER TABLE "pcs" ADD COLUMN "map_row" integer;--> statement-breakpoint
ALTER TABLE "pcs" ADD COLUMN "map_col" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "pcs_map_cell_idx" ON "pcs" USING btree ("map_row","map_col");--> statement-breakpoint
ALTER TABLE "pcs" ADD CONSTRAINT "pcs_map_cell_check" CHECK (("pcs"."map_row" is null) = ("pcs"."map_col" is null));