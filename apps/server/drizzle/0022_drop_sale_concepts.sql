-- Spec 005, T28b: el otro ingreso sustituye a los conceptos (REQ-005-05). Las líneas de
-- concepto pasan a otros ingresos con "Nombre × cantidad" de comentario y su total como
-- importe; después se borran la columna y la tabla de los conceptos. Los eventos ya
-- guardados no cambian (ADR-0008).
UPDATE "sale_lines" SET "kind" = 'other', "comment" = "name" || ' × ' || "quantity", "name" = 'Otro ingreso', "quantity" = 1, "unit_price_micros" = "total_micros", "concept_id" = NULL WHERE "kind" = 'concept';--> statement-breakpoint
ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_lines_kind_fields";--> statement-breakpoint
ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_lines_concept_id_sale_concepts_id_fk";--> statement-breakpoint
ALTER TABLE "sale_lines" DROP COLUMN "concept_id";--> statement-breakpoint
DROP TABLE "sale_concepts";--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_kind_fields" CHECK (("sale_lines"."kind" = 'product' and "sale_lines"."product_id" is not null)
        or ("sale_lines"."kind" = 'other' and "sale_lines"."product_id" is null and "sale_lines"."quantity" = 1));
