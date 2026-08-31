ALTER TABLE "products" DROP CONSTRAINT "products_species_id_species_id_fk";
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_adult_size_range_valid" CHECK ("species"."adult_size_min_mm" is null or "species"."adult_size_max_mm" is null or "species"."adult_size_min_mm" <= "species"."adult_size_max_mm");