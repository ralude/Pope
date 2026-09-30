CREATE TABLE "combos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_micros" bigint NOT NULL,
	"seconds" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combos_price_positive" CHECK ("combos"."price_micros" > 0),
	CONSTRAINT "combos_seconds_positive" CHECK ("combos"."seconds" > 0)
);
