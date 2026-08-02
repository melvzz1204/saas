import DentalService from "../models/dentalServicePrice.js";

export const DEFAULT_CLINIC_SERVICES = [
  // Routine & Preventive Care
  {
    slug: "cleanings-and-scaling",
    name: "Cleanings & Scaling",
    description: "Removes plaque and tartar buildup.",
    basePricePhp: 1500,
    updatedBy: "System Seed Script",
  },
  {
    slug: "exams-and-x-rays",
    name: "Exams & X-rays",
    description: "Diagnoses cavities, bone loss, and oral issues.",
    basePricePhp: 1000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "fluoride-treatments",
    name: "Fluoride Treatments",
    description: "Strengthens enamel to prevent decay.",
    basePricePhp: 800,
    updatedBy: "System Seed Script",
  },
  {
    slug: "dental-sealants",
    name: "Dental Sealants",
    description: "Plastic coatings applied to chewing surfaces.",
    basePricePhp: 1200,
    updatedBy: "System Seed Script",
  },

  // Restorative Treatments
  {
    slug: "fillings",
    name: "Fillings",
    description: "Repairs cavities with composite or amalgam.",
    basePricePhp: 1500,
    updatedBy: "System Seed Script",
  },
  {
    slug: "crowns-caps",
    name: "Crowns (Caps)",
    description: "Encases damaged or weak teeth.",
    basePricePhp: 12000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "bridges",
    name: "Bridges",
    description: "Replaces missing teeth using adjacent teeth.",
    basePricePhp: 20000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "inlays-and-onlays",
    name: "Inlays & Onlays",
    description: "Custom partial fillings for larger decay.",
    basePricePhp: 8000,
    updatedBy: "System Seed Script",
  },

  // Endodontic & Oral Surgery
  {
    slug: "root-canals",
    name: "Root Canals",
    description: "Removes infected pulp to save a tooth.",
    basePricePhp: 10000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "tooth-extractions",
    name: "Tooth Extractions",
    description: "Pulls severely damaged or wisdom teeth.",
    basePricePhp: 2500,
    updatedBy: "System Seed Script",
  },
  {
    slug: "dental-implants",
    name: "Dental Implants",
    description: "Anchors artificial teeth into the jawbone.",
    basePricePhp: 60000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "bone-grafting",
    name: "Bone Grafting",
    description: "Rebuilds jawbone structure before implants.",
    basePricePhp: 15000,
    updatedBy: "System Seed Script",
  },

  // Cosmetic & Orthodontic Procedures
  {
    slug: "teeth-whitening",
    name: "Teeth Whitening",
    description: "Bleaches stains for a brighter smile.",
    basePricePhp: 8000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "veneers",
    name: "Veneers",
    description: "Bonds thin porcelain shells to tooth fronts.",
    basePricePhp: 18000,
    updatedBy: "System Seed Script",
  },
  {
    slug: "braces-and-aligners",
    name: "Braces & Aligners",
    description: "Straightens misaligned teeth and jaws.",
    basePricePhp: 45000,
    updatedBy: "System Seed Script",
  },

  // Periodontal (Gum) Therapy
  {
    slug: "deep-cleaning",
    name: "Deep Cleaning",
    description: "Cleans below the gumline (scaling and root planing).",
    basePricePhp: 3500,
    updatedBy: "System Seed Script",
  },
  {
    slug: "gum-grafting",
    name: "Gum Grafting",
    description: "Repairs severe gum recession.",
    basePricePhp: 20000,
    updatedBy: "System Seed Script",
  },
];

/**
 * Automatically inserts default services into MongoDB if they don't exist yet.
 */
export async function seedDefaultServices() {
  try {
    console.log("⏳ [Auto-Seed] Verifying default dental services...");

    const operations = DEFAULT_CLINIC_SERVICES.map((service) => ({
      updateOne: {
        filter: { slug: service.slug },
        update: { $setOnInsert: service },
        upsert: true,
      },
    }));

    const result = await DentalService.bulkWrite(operations);

    if (result.upsertedCount > 0) {
      console.log(
        `🌱 [Auto-Seed] Success! Added ${result.upsertedCount} new dental services to database.`,
      );
    } else {
      console.log(
        `✅ [Auto-Seed] Complete! All ${result.matchedCount} default services already exist.`,
      );
    }

    return result;
  } catch (error) {
    console.error(
      "❌ [Auto-Seed] Error seeding default dental services:",
      error.message,
    );
  }
}
