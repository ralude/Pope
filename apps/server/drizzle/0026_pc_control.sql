CREATE TABLE "pc_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pc_id" uuid NOT NULL,
	"actor" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"expected" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"last_result" jsonb,
	"last_result_at" timestamp with time zone,
	CONSTRAINT "pc_commands_id_pc_unique" UNIQUE("id","pc_id"),
	CONSTRAINT "pc_commands_ttl_check" CHECK ("pc_commands"."expires_at" = "pc_commands"."issued_at" + interval '30 seconds'),
	CONSTRAINT "pc_commands_actor_check" CHECK (coalesce("pc_commands"."actor"->>'kind' = 'staff', false)),
	CONSTRAINT "pc_commands_action_check" CHECK (coalesce("pc_commands"."action"->>'kind' in ('lock', 'restart', 'powerOff', 'showMessage', 'startMaintenance', 'endMaintenance'), false)),
	CONSTRAINT "pc_commands_status_check" CHECK ("pc_commands"."status" in ('requested', 'accepted', 'applied', 'failed', 'expired', 'cancelled')),
	CONSTRAINT "pc_commands_result_check" CHECK (
      ("pc_commands"."last_result" is null and "pc_commands"."last_result_at" is null and "pc_commands"."status" in ('requested', 'expired', 'cancelled')) or
      ("pc_commands"."last_result" is not null and "pc_commands"."last_result_at" is not null
        and coalesce("pc_commands"."last_result"->>'status' = "pc_commands"."status", false)
        and "pc_commands"."status" in ('accepted', 'applied', 'failed'))),
	CONSTRAINT "pc_commands_power_result_check" CHECK ("pc_commands"."status" <> 'applied' or "pc_commands"."action"->>'kind' not in ('restart', 'powerOff'))
);
--> statement-breakpoint
CREATE TABLE "pc_control_states" (
	"pc_id" uuid PRIMARY KEY NOT NULL,
	"revision" uuid NOT NULL,
	"reserved_command_id" uuid,
	"reserved_at" timestamp with time zone,
	CONSTRAINT "pc_control_states_reservation_check" CHECK (("pc_control_states"."reserved_command_id" is null) = ("pc_control_states"."reserved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "pc_commands" ADD CONSTRAINT "pc_commands_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_control_states" ADD CONSTRAINT "pc_control_states_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_control_states" ADD CONSTRAINT "pc_control_states_reserved_command_id_pc_id_pc_commands_id_pc_id_fk" FOREIGN KEY ("reserved_command_id","pc_id") REFERENCES "public"."pc_commands"("id","pc_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pc_commands_pc_issued_idx" ON "pc_commands" USING btree ("pc_id","issued_at");--> statement-breakpoint
CREATE INDEX "pc_commands_pending_expiration_idx" ON "pc_commands" USING btree ("expires_at") WHERE "pc_commands"."status" = 'requested';