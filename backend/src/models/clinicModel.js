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
  },
  { timestamps: true },
);

export default mongoose.model("Clinic", clinicSchema);
