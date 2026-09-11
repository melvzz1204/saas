import mongoose from "mongoose";

// A single editable content block on the customizable landing page.
const landingBlockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["text", "image"], default: "text" },
    heading: { type: String, default: "", trim: true, maxlength: 120 },
    body: { type: String, default: "", trim: true, maxlength: 1500 },
    imageUrl: { type: String, default: "", trim: true },
    background: {
      type: String,
      enum: ["none", "muted", "brand"],
      default: "none",
    },
    align: { type: String, enum: ["left", "center"], default: "left" },
  },
  { _id: false },
);

// Editable headline/intro text for one static section of the landing page.
const landingSectionTextSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, default: "", trim: true, maxlength: 120 },
    heading: { type: String, default: "", trim: true, maxlength: 160 },
    intro: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: false },
);

// The self-service landing-page customization for a clinic. Stored twice on
// the clinic: `draft` (edited in the dashboard) and `published` (served to the
// public). Keys are intentionally small and typed so the public page can never
// receive arbitrary markup.
const landingConfigSchema = new mongoose.Schema(
  {
    // Which whole-page LAYOUT the clinic has chosen (see landingTemplates.js).
    // Defaults to "classic" so existing clinics render exactly as before.
    template: { type: String, default: "classic" },
    preset: { type: String, default: "" },
    logoUrl: { type: String, default: "", trim: true },
    primaryColor: { type: String, default: "", trim: true }, // hex validated in routes
    secondaryColor: { type: String, default: "", trim: true }, // hex validated in routes
    // Optional header/footer background overrides (hex validated in routes).
    headerBackground: { type: String, default: "", trim: true },
    footerBackground: { type: String, default: "", trim: true },
    typography: {
      type: String,
      enum: ["default", "clean", "elegant", "rounded"],
      default: "default",
    },
    tagline: { type: String, default: "", trim: true, maxlength: 160 },
    // Merged clinic profile text (migrated from clinic.description).
    description: { type: String, default: "", trim: true, maxlength: 600 },
    heroEyebrow: { type: String, default: "", trim: true, maxlength: 120 },
    // Static section text (headline + intro) for the built-in page sections.
    sectionTexts: {
      type: new mongoose.Schema(
        {
          services: landingSectionTextSchema,
          dentists: landingSectionTextSchema,
          testimonials: landingSectionTextSchema,
          pricing: landingSectionTextSchema,
          visit: landingSectionTextSchema,
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    socialLinks: [
      {
        platform: {
          type: String,
          enum: ["facebook", "instagram", "twitter", "linkedin", "website"],
        },
        url: { type: String, default: "", trim: true },
      },
    ],
    blocks: { type: [landingBlockSchema], default: [] },
    hiddenSections: { type: [String], default: [] },
    sectionOrder: { type: [String], default: [] },
  },
  { _id: false },
);

const clinicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional during migration so existing clinic records remain readable.
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
    address: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 600,
    },
    // Self-service landing page builder configuration.
    landing: {
      draft: { type: landingConfigSchema, default: () => ({}) },
      published: { type: landingConfigSchema, default: () => ({}) },
    },
    contactNumber: {
      type: String,
      default: "",
      trim: true,
    },
    applicationStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    submittedDocuments: [
      {
        documentName: String,
        documentType: {
          type: String,
          enum: [
            "Business License",
            "Medical License",
            "Verification Document",
          ],
          default: "Verification Document",
        },
        fileUrl: String, // URL to the uploaded file (e.g., AWS S3, Cloudinary, or local path)
      },
    ],
    rejectionReason: {
      type: String,
      default: "",
    },
    notifications: [
      {
        type: {
          type: String,
          enum: ["ApplicationRejected", "ApplicationApproved"],
        },
        message: { type: String, required: true },
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Add this block right here:
    slotDurationMinutes: {
      type: Number,
      default: 30,
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
