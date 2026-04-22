const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { protect } = require("../middleware/auth");
const Client = require("../models/Client");

// ─── PUBLIC ROUTES ───────────────────────────────────────────────────────────

// @route   POST /api/clients/register
// @desc    Client self-registration (website)
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, dateOfBirth, gender, address } =
      req.body;

    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name, email, phone and password are required",
        });
    }

    const exists = await Client.findOne({ email });
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const client = await Client.create({
      name,
      email,
      phone,
      dateOfBirth,
      gender,
      address,
      password: hashedPassword,
    });

    const token = jwt.sign(
      { id: client._id, role: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      success: true,
      token,
      data: {
        _id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/clients/login
// @desc    Client login (website)
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });

    const client = await Client.findOne({ email }).select("+password");
    if (!client || !(await bcrypt.compare(password, client.password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: client._id, role: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({
      success: true,
      token,
      data: { _id: client._id, name: client.name, email: client.email },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN ROUTES (protected) ───────────────────────────────────────────────

// @route   POST /api/clients
// @desc    Admin creates client manually
// @access  Admin
router.post("/", protect, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      dateOfBirth,
      gender,
      address,
      emergencyContact,
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name, email, phone and password are required",
        });
    }

    const exists = await Client.findOne({ email });
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const client = await Client.create({
      name,
      email,
      phone,
      dateOfBirth,
      gender,
      address,
      emergencyContact,
      password: hashedPassword,
      createdBy: req.admin._id,
    });

    res.status(201).json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/clients
// @desc    Get all clients
// @access  Admin
router.get("/", protect, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [clients, total] = await Promise.all([
      Client.find(query)
        .select("-password")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      Client.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: clients });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/clients/:id
// @desc    Get single client
// @access  Admin
router.get("/:id", protect, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .select("-password")
      .populate("activeMembership");
    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/clients/:id
// @desc    Update client
// @access  Admin
router.put("/:id", protect, async (req, res) => {
  try {
    const { password, ...updateData } = req.body; // prevent password change via this route
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true },
    ).select("-password");

    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/clients/:id/status
// @desc    Activate / deactivate / suspend client
// @access  Admin
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["active", "inactive", "suspended"];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Status must be one of: ${allowed.join(", ")}`,
        });
    }

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    ).select("-password");

    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/clients/:id
// @desc    Delete client
// @access  Admin
router.delete("/:id", protect, async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    res.json({ success: true, message: "Client deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
