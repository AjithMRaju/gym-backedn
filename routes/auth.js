const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const Admin = require("../models/Admin");
const { protect } = require("../middleware/auth");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Create first admin (protect this in production – allow only superadmin)
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 chars"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { name, email, password, role } = req.body;
    try {
      const exists = await Admin.findOne({ email });
      if (exists)
        return res
          .status(409)
          .json({ success: false, message: "Email already registered" });

      const admin = await Admin.create({ name, email, password, role });
      res.status(201).json({
        success: true,
        message: "Admin created",
        token: signToken(admin._id),
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { email, password } = req.body;
    try {
      const admin = await Admin.findOne({ email });
      if (!admin || !(await admin.matchPassword(password))) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }
      res.json({
        success: true,
        token: signToken(admin._id),
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", protect, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// ─── PUT /api/auth/change-password ───────────────────────────────────────────
router.put("/change-password", protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const admin = await Admin.findById(req.admin._id);
    if (!(await admin.matchPassword(currentPassword))) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is wrong" });
    }
    admin.password = newPassword;
    await admin.save();
    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
