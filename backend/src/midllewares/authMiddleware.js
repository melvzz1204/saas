import jwt from "jsonwebtoken";

export const protectPatientRoute = (req, res, next) => {
  let token;

  // 1. Check if the token is sent in the Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Extract token from "Bearer <TOKEN>"
      token = req.headers.authorization.split(" ")[1];

      // 2. Verify the token using your secret key
      // process.env.JWT_SECRET pulls the key you just put in the .env file
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Attach the decrypted patient data to the request object
      req.patient = decoded;

      next(); // Move on to the controller
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token invalid or expired",
      });
    }
  }

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Not authorized, no token provided" });
  }
};
