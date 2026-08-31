CREATE UNIQUE INDEX "media_url_key" ON "media" USING btree ("url");--> statement-breakpoint
CREATE INDEX "media_species_position_idx" ON "media" USING btree ("species_id","position");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_position_non_negative" CHECK ("media"."position" >= 0);