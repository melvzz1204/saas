import DentalService from "../models/dentalServicePrice.js";

export const getServices = async (req, res) => {
  try {
    const services = await DentalService.find(
      {},
      "slug name description basePricePhp",
    );
    return res.status(200).json({ success: true, data: services });
  } catch (error) {
    console.error("❌ Mongoose GET Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "MongoDB read fault." });
  }
};

export const updateServicePrice = async (req, res) => {
  const { slug, newPrice, adminId } = req.body;

  if (!slug || newPrice === undefined || newPrice < 0) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid schema parameters payload." });
  }

  try {
    const updatedService = await DentalService.findOneAndUpdate(
      { slug: slug.toLowerCase().trim() },
      {
        $set: {
          basePricePhp: Number(newPrice),
          updatedBy: adminId || "Clinic Admin",
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedService) {
      return res
        .status(404)
        .json({ success: false, message: "Target service track not found." });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully altered fixed pricing to ₱${newPrice} for ${updatedService.name}`,
      data: updatedService,
    });
  } catch (error) {
    console.error("❌ Mongoose PATCH Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Database update transaction failed." });
  }
};

export const addServicePrice = async (req, res) => {
  const { slug, name, description, basePricePhp, adminId } = req.body;

  if (!slug || !name || basePricePhp === undefined || basePricePhp < 0) {
    return res.status(400).json({
      success: false,
      message: "Missing or invalid payload parameters.",
    });
  }

  try {
    const cleanSlug = slug.toLowerCase().trim();

    const existing = await DentalService.findOne({ slug: cleanSlug });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "This service track slug already exists.",
      });
    }

    const newService = await DentalService.create({
      slug: cleanSlug,
      name,
      description,
      basePricePhp: Number(basePricePhp),
      updatedBy: adminId || "Clinic Admin",
    });

    return res.status(201).json({
      success: true,
      message: `Successfully registered new service track: ${name}`,
      data: newService,
    });
  } catch (error) {
    console.error("❌ Mongoose POST Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to persist new service entry.",
    });
  }
};
