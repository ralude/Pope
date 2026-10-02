-- La caja pasa a ser del local (REQ-005-44): solo una abierta. Si hubiera varias abiertas
-- (solo en bases de desarrollo: Pope aún no se usa en el local), se cierran todas menos la
-- más reciente, para poder crear el índice único.
UPDATE "cash_shifts" SET "closed_at" = now()
WHERE "closed_at" IS NULL
  AND "id" <> (SELECT "id" FROM "cash_shifts" WHERE "closed_at" IS NULL ORDER BY "opened_at" DESC LIMIT 1);--> statement-breakpoint
DROP INDEX "cash_shifts_open_staff_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "cash_shifts_one_open_idx" ON "cash_shifts" USING btree (("closed_at" is null)) WHERE "cash_shifts"."closed_at" is null;
