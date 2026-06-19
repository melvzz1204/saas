import jwt from "jsonwebtoken";

export const protectPatientRoute = (req, res, next) => {
  let token;

  /*   console.log("DEBUG - Secret Key:", process.env.JWT_SECRET);
  console.log("DEBUG - Incoming Token:", token);
  const decoded = jwt.verify(token, process.env.JWT_SECRET); */
  // 1. Guard Clause: Check if the Authorization header exists and follows the Bearer schema
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      const parts = req.headers.authorization.split(" ");

      if (parts.length !== 2) {
        return res.status(401).json({
          success: false,
          message:
            "Not authorized, authorization header format must be: Bearer <token>",
        });
      }

      token = parts[1];

      // 2. Verify the token using your secret key
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Attach the decrypted payload to BOTH identifiers to satisfy all controllers
      req.patient = decoded;
      req.user = decoded; // ✨ Added this line to fix the controller lookup crash!

      return next();
    } catch (error) {
      console.error("❌ JWT Verification Error:", error.message);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token invalid or expired",
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided or invalid header schema",
    });
  }
};
