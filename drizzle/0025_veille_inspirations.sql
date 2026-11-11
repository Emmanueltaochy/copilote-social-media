CREATE TABLE "veille_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"network" text NOT NULL,
	"handle" text NOT NULL,
	"kind" text DEFAULT 'concurrent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veille_accounts" ADD CONSTRAINT "veille_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "veille_accounts_unique" ON "veille_accounts" USING btree ("client_id","network","handle");