import mongoose from "mongoose";

const DentalServiceSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    }, // e.g., 'routine-cleaning', 'root-canal'
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    basePricePhp: {
      type: Number,
      required: true,
      min: 0,
    },
    updatedBy: {
      type: String,
      default: "System Admin Node",
    },
    isAvailable: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

export default mongoose.models.DentalService ||
  mongoose.model("DentalService", DentalServiceSchema);
