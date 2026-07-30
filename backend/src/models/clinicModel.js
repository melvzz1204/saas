import mongoose from "mongoose";

const clinicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicationStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    submittedDocuments: [
      {
        documentName: String,
        fileUrl: String, // URL to the uploaded file (e.g., AWS S3, Cloudinary, or local path)
      },
    ],
    rejectionReason: {
      type: String,
      default: "",
    },
    operatingHours: [
      {
        day: {
          type: String,
          enum: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ],
        },
        openTime: { type: String, default: "09:00" },
        closeTime: { type: String, default: "17:00" },
        isClosed: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("Clinic", clinicSchema);
