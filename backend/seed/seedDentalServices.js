import DentalService from "@/models/DentalService"; // Path to your Mongoose model
import { DEFAULT_CLINIC_SERVICES } from "@/constants/clinicServices";

export async function seedDentalServices() {
  try {
    console.log("🌱 Seeding Dental Services into MongoDB...");

    const operations = DEFAULT_CLINIC_SERVICES.map((service) => ({
      updateOne: {
        filter: { slug: service.slug },
        update: {
          $setOnInsert: {
            slug: service.slug,
            name: service.name,
            description: service.description,
            basePricePhp: service.basePricePhp,
            updatedBy: "System Seed Script",
          },
        },
        upsert: true,
      },
    }));

    const result = await DentalService.bulkWrite(operations);
    console.log(
      `✅ Database Seeding Complete! Upserted: ${result.upsertedCount}, Matched: ${result.matchedCount}`,
    );
  } catch (error) {
    console.error("❌ Error seeding Dental Services:", error);
    throw error;
  }
}
