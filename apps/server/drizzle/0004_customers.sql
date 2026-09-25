CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_status_check" CHECK ("customers"."status" in ('active', 'blocked', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_username_lower_idx" ON "customers" USING btree (lower("username"));