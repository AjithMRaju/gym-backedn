const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Trainer = require("../models/Trainer");

// ─── PUBLIC ROUTES ───────────────────────────────────────────────────────────

// @route   GET /api/trainers/public
// @desc    Get active trainers for website display
// @access  Public
router.get("/public", async (req, res) => {
  try {
    const trainers = await Trainer.find({ status: "active" }).select(
      "name specializations bio photo rating reviewCount experience",
    );
    res.json({ success: true, data: trainers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN ROUTES (protected) ───────────────────────────────────────────────

// @route   POST /api/trainers
// @desc    Add new trainer
// @access  Admin
router.post("/", protect, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      specializations,
      certifications,
      bio,
      experience,
      salary,
      schedule,
      photo,
    } = req.body;

    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name, email and phone are required",
        });
    }

    const exists = await Trainer.findOne({ email });
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "Trainer email already exists" });

    const trainer = await Trainer.create({
      name,
      email,
      phone,
      specializations,
      certifications,
      bio,
      experience,
      salary,
      schedule,
      photo,
      addedBy: req.admin._id,
    });

    res.status(201).json({ success: true, data: trainer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/trainers
// @desc    Get all trainers
// @access  Admin
router.get("/", protect, async (req, res) => {
  try {
    const { status, specialization, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (specialization) query.specializations = { $in: [specialization] };
    if (search)
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [trainers, total] = await Promise.all([
      Trainer.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      Trainer.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: trainers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/trainers/:id
// @desc    Get single trainer
// @access  Admin
router.get("/:id", protect, async (req, res) => {
  try {
    const trainer = await Trainer.findById(req.params.id);
    if (!trainer)
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    res.json({ success: true, data: trainer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/trainers/:id
// @desc    Update trainer
// @access  Admin
router.put("/:id", protect, async (req, res) => {
  try {
    const trainer = await Trainer.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true },
    );
    if (!trainer)
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    res.json({ success: true, data: trainer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/trainers/:id/status
// @desc    Activate / deactivate trainer
// @access  Admin
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "inactive", "on_leave"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status value" });
    }
    const trainer = await Trainer.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!trainer)
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    res.json({ success: true, data: trainer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/trainers/:id
// @desc    Delete trainer
// @access  Admin
router.delete("/:id", protect, async (req, res) => {
  try {
    const trainer = await Trainer.findByIdAndDelete(req.params.id);
    if (!trainer)
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    res.json({ success: true, message: "Trainer deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
