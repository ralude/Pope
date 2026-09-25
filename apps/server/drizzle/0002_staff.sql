CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_role_check" CHECK ("staff"."role" in ('encargado', 'administrador', 'dueno'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_username_lower_idx" ON "staff" USING btree (lower("username"));