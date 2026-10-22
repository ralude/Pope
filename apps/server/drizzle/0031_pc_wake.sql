ALTER TABLE "pc_control_states" ADD COLUMN "wake_request_id" uuid;--> statement-breakpoint
ALTER TABLE "pc_control_states" ADD COLUMN "wake_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pc_control_states" ADD CONSTRAINT "pc_control_states_wake_check" CHECK (("pc_control_states"."wake_request_id" is null) = ("pc_control_states"."wake_requested_at" is null));