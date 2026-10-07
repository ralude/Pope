CREATE TABLE "lock_screen_background" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"sha256" text,
	"size" integer,
	"mime_type" text,
	"width" integer,
	"height" integer,
	"changed_at" timestamp with time zone,
	"changed_by" jsonb,
	CONSTRAINT "lock_screen_background_singleton_check" CHECK ("lock_screen_background"."id" = 1),
	CONSTRAINT "lock_screen_background_revision_check" CHECK ("lock_screen_background"."revision" between 0 and 9007199254740991),
	CONSTRAINT "lock_screen_background_sha256_check" CHECK ("lock_screen_background"."sha256" is null or "lock_screen_background"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lock_screen_background_image_check" CHECK (
      ("lock_screen_background"."sha256" is null and "lock_screen_background"."size" is null and "lock_screen_background"."mime_type" is null
        and "lock_screen_background"."width" is null and "lock_screen_background"."height" is null) or
      ("lock_screen_background"."sha256" is not null and "lock_screen_background"."size" is not null and "lock_screen_background"."mime_type" is not null
        and "lock_screen_background"."width" is not null and "lock_screen_background"."height" is not null
        and "lock_screen_background"."size" between 1 and 2000000 and "lock_screen_background"."mime_type" = 'image/webp'
        and "lock_screen_background"."width" between 1 and 1920
        and "lock_screen_background"."height" between 1 and 1080)),
	CONSTRAINT "lock_screen_background_change_check" CHECK (
      ("lock_screen_background"."revision" = 0 and "lock_screen_background"."sha256" is null and "lock_screen_background"."changed_at" is null and "lock_screen_background"."changed_by" is null) or
      ("lock_screen_background"."revision" > 0 and "lock_screen_background"."changed_at" is not null and "lock_screen_background"."changed_by" is not null
        and coalesce("lock_screen_background"."changed_by"->>'kind' = 'staff', false)))
);
--> statement-breakpoint
-- Estado inicial sin cambio del administrador: fondo por defecto y revisión cero.
INSERT INTO "lock_screen_background" ("id", "revision") VALUES (1, 0);
