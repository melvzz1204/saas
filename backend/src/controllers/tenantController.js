import Clinic from "../models/clinicModel.js";
import User from "../models/userModel.js";

export const registerClinicController = async (req, res) => {
  try {
    const {
      name,
      slug,
      adminFirstName,
      adminLastName,
      email,
      phone,
      dateOfBirth,
      password,
    } = req.body;

    // 1. Validation: Ensure clinic data is present
    if (!name || !slug || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required clinic registration fields.",
      });
    }

    // 2. Check if clinic slug already exists
    const existingClinic = await Clinic.findOne({ slug });
    if (existingClinic) {
      return res.status(400).json({
        success: false,
        message: "This clinic URL slug is already taken.",
      });
    }

    // 3. Create the Clinic
    const newClinic = await Clinic.create({ name, slug });

    // 4. Create the Clinic Administrator User linked to this new clinic
    const newAdmin = await User.create({
      clinicId: newClinic._id,
      firstName: adminFirstName || "Clinic",
      lastName: adminLastName || "Admin",
      email,
      phone: phone || "000-0000",
      dateOfBirth: dateOfBirth || new Date(),
      password, // Hashed automatically by our userModel pre-save hook
      role: "CLINIC_ADMIN",
    });

    // 5. Send back the response containing your coveted Clinic ID
    return res.status(201).json({
      success: true,
      message: "SaaS Clinic Registered Successfully!",
      data: {
        clinicId: newClinic._id,
        clinicName: newClinic.name,
        adminEmail: newAdmin.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
