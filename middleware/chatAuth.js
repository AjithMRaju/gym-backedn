const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Trainer = require("../models/Trainer");

/**
 * Helper to verify JWT token and load user (Admin or Trainer).
 * Used both in Express routes and in Socket.io connection handshake.
 */
const verifyChatUser = async (token) => {
  if (!token) {
    throw new Error("No token provided");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded || !decoded.id) {
    throw new Error("Invalid token payload");
  }

  // 1. If explicit trainer role or check Trainer collection
  if (decoded.role === "trainer") {
    const trainer = await Trainer.findById(decoded.id);
    if (!trainer) {
      throw new Error("Trainer not found");
    }
    if (trainer.status !== "active") {
      const err = new Error("Trainer account is not active");
      err.code = "TRAINER_INACTIVE";
      throw err;
    }
    return {
      user: {
        id: trainer._id.toString(),
        _id: trainer._id,
        role: "Trainer",
        name: trainer.name,
        email: trainer.email,
        photo: trainer.photo || "",
        status: trainer.status,
      },
      doc: trainer,
      userType: "Trainer",
    };
  }

  // 2. Check Admin collection
  const admin = await Admin.findById(decoded.id).select("-password");
  if (admin) {
    return {
      user: {
        id: admin._id.toString(),
        _id: admin._id,
        role: "Admin",
        name: admin.name,
        email: admin.email,
        photo: "",
        status: "active",
      },
      doc: admin,
      userType: "Admin",
    };
  }

  // 3. Fallback: check Trainer if not found in Admin
  const trainer = await Trainer.findById(decoded.id);
  if (trainer) {
    if (trainer.status !== "active") {
      const err = new Error("Trainer account is not active");
      err.code = "TRAINER_INACTIVE";
      throw err;
    }
    return {
      user: {
        id: trainer._id.toString(),
        _id: trainer._id,
        role: "Trainer",
        name: trainer.name,
        email: trainer.email,
        photo: trainer.photo || "",
        status: trainer.status,
      },
      doc: trainer,
      userType: "Trainer",
    };
  }

  throw new Error("User account not found");
};

/**
 * Express middleware for chat endpoints
 */
const protectChat = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Access denied. Authentication token required.",
    });
  }

  try {
    const { user, doc, userType } = await verifyChatUser(token);
    req.user = user;
    if (userType === "Admin") {
      req.admin = doc;
    } else {
      req.trainer = doc;
    }
    req.token = token;
    next();
  } catch (err) {
    if (err.code === "TRAINER_INACTIVE") {
      return res.status(403).json({
        success: false,
        code: "TRAINER_INACTIVE",
        message:
          "Trainer account is not active. Real-time chat is only permitted for active trainers.",
      });
    }

    return res.status(401).json({
      success: false,
      code: "TOKEN_INVALID",
      message: err.message || "Invalid or expired token",
    });
  }
};

module.exports = {
  verifyChatUser,
  protectChat,
};
