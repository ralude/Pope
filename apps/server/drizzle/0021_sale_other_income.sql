ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_lines_kind_fields";--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_comment" CHECK ("sale_lines"."comment" is null or "sale_lines"."kind" = 'other');--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_kind_fields" CHECK (("sale_lines"."kind" = 'product' and "sale_lines"."product_id" is not null and "sale_lines"."concept_id" is null)
        or ("sale_lines"."kind" = 'concept' and "sale_lines"."concept_id" is not null and "sale_lines"."product_id" is null)
        or ("sale_lines"."kind" = 'other' and "sale_lines"."product_id" is null and "sale_lines"."concept_id" is null and "sale_lines"."quantity" = 1));