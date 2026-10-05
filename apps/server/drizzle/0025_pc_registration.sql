CREATE TABLE "pc_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pc_id" uuid NOT NULL,
	"installation_code_id" uuid NOT NULL,
	"credential_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_staff_id" uuid,
	CONSTRAINT "pc_credentials_installation_code_id_unique" UNIQUE("installation_code_id"),
	CONSTRAINT "pc_credentials_credential_hash_unique" UNIQUE("credential_hash"),
	CONSTRAINT "pc_credentials_hash_check" CHECK ("pc_credentials"."credential_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "pc_credentials_revocation_check" CHECK (
    ("pc_credentials"."revoked_at" is null or "pc_credentials"."revoked_at" >= "pc_credentials"."created_at")
    and ("pc_credentials"."revoked_by_staff_id" is null or "pc_credentials"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "pc_installation_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"created_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"target_pc_id" uuid,
	"consumed_at" timestamp with time zone,
	"consumed_pc_id" uuid,
	CONSTRAINT "pc_installation_codes_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "pc_installation_codes_consumed_pc_unique" UNIQUE("id","consumed_pc_id"),
	CONSTRAINT "pc_installation_codes_hash_check" CHECK ("pc_installation_codes"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "pc_installation_codes_ttl_check" CHECK ("pc_installation_codes"."expires_at" = "pc_installation_codes"."created_at" + interval '600 seconds'),
	CONSTRAINT "pc_installation_codes_consumption_check" CHECK (
    ("pc_installation_codes"."consumed_at" is null and "pc_installation_codes"."consumed_pc_id" is null) or
    ("pc_installation_codes"."consumed_at" is not null and "pc_installation_codes"."consumed_pc_id" is not null
      and "pc_installation_codes"."consumed_at" >= "pc_installation_codes"."created_at" and "pc_installation_codes"."consumed_at" < "pc_installation_codes"."expires_at"
      and ("pc_installation_codes"."target_pc_id" is null or "pc_installation_codes"."target_pc_id" = "pc_installation_codes"."consumed_pc_id")))
);
--> statement-breakpoint
ALTER TABLE "pcs" ADD COLUMN "mac_address" text;--> statement-breakpoint
ALTER TABLE "pc_credentials" ADD CONSTRAINT "pc_credentials_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_credentials" ADD CONSTRAINT "pc_credentials_revoked_by_staff_id_staff_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_credentials" ADD CONSTRAINT "pc_credentials_installation_code_id_pc_id_pc_installation_codes_id_consumed_pc_id_fk" FOREIGN KEY ("installation_code_id","pc_id") REFERENCES "public"."pc_installation_codes"("id","consumed_pc_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_installation_codes" ADD CONSTRAINT "pc_installation_codes_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_installation_codes" ADD CONSTRAINT "pc_installation_codes_target_pc_id_pcs_id_fk" FOREIGN KEY ("target_pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_installation_codes" ADD CONSTRAINT "pc_installation_codes_consumed_pc_id_pcs_id_fk" FOREIGN KEY ("consumed_pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pc_credentials_active_pc_idx" ON "pc_credentials" USING btree ("pc_id") WHERE "pc_credentials"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "pc_installation_codes_expiration_idx" ON "pc_installation_codes" USING btree ("expires_at") WHERE "pc_installation_codes"."consumed_at" is null;--> statement-breakpoint
ALTER TABLE "pcs" ADD CONSTRAINT "pcs_mac_address_check" CHECK ("pcs"."mac_address" is null or
      ("pcs"."mac_address" ~ '^[0-9A-F][02468ACE](:[0-9A-F]{2}){5}$'
        and "pcs"."mac_address" <> '00:00:00:00:00:00'));