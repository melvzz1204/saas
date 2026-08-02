import DentalService from "../models/dentalServicePrice.js";

export const getServices = async (req, res) => {
  try {
    const services = await DentalService.find(
      {},
      "slug name description basePricePhp isAvailable",
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
  // 🎯 Accept both 'newPrice' or 'basePricePhp' from req.body
  const { slug, newPrice, basePricePhp, adminId } = req.body;

  // Fallback: Use newPrice if provided, otherwise basePricePhp
  const targetPrice = newPrice !== undefined ? newPrice : basePricePhp;

  // Validation against schema constraints (min: 0) [source: 8]
  if (
    !slug ||
    targetPrice === undefined ||
    targetPrice === null ||
    Number(targetPrice) < 0
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid schema parameters payload. 'slug' and a valid price (>= 0) are required.",
    });
  }

  try {
    const updatedService = await DentalService.findOneAndUpdate(
      { slug: slug.toLowerCase().trim() },
      {
        $set: {
          basePricePhp: Number(targetPrice), // Aligns with schema field basePricePhp [source: 8]
          updatedBy: adminId || "Clinic Admin",
        },
      },
      { new: true, runValidators: true }, // Enforces schema validation [source: 8]
    );

    if (!updatedService) {
      return res
        .status(404)
        .json({ success: false, message: "Target service track not found." });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully altered fixed pricing to ₱${targetPrice} for ${updatedService.name}`,
      data: updatedService,
    });
  } catch (error) {
    console.error("❌ Mongoose PATCH Error:", error);
    return res.status(500).json({
      success: false,
      message: "Database update transaction failed.",
      error: error.message,
    });
  }
};

// 🎛️ NEW: Toggle Service Availability by MongoDB _id
export const toggleServiceAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;

    const updatedService = await DentalService.findByIdAndUpdate(
      id,
      { isAvailable },
      { new: true, runValidators: true },
    );

    if (!updatedService) {
      return res.status(404).json({
        success: false,
        message: "Dental service item not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Dental service '${updatedService.name}' availability updated successfully.`,
      data: updatedService,
    });
  } catch (error) {
    console.error("❌ Mongoose Toggle Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error updating service state.",
      error: error.message,
    });
  }
};

export const addServicePrice = async (req, res) => {
  const { slug, name, description, basePricePhp, isAvailable, adminId } =
    req.body;

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
      isAvailable: isAvailable ?? true,
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
