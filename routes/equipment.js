const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Equipment = require("../models/Eqipment");

// ─── ADMIN ROUTES (protected) ───────────────────────────────────────────────

// @route   POST /api/equipment
// @desc    Add new equipment
// @access  Admin
router.post("/", protect, async (req, res) => {
  try {
    const {
      name,
      category,
      brand,
      model,
      serialNumber,
      purchaseDate,
      purchasePrice,
      condition,
      location,
      description,
      maintenanceIntervalDays,
      image,
    } = req.body;

    if (!name || !category) {
      return res
        .status(400)
        .json({ success: false, message: "Name and category are required" });
    }

    const equipment = await Equipment.create({
      name,
      category,
      brand,
      model,
      serialNumber,
      purchaseDate,
      purchasePrice,
      condition: condition || "good",
      location,
      description,
      maintenanceIntervalDays,
      image,
      addedBy: req.admin._id,
    });

    res.status(201).json({ success: true, data: equipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/equipment
// @desc    Get all equipment (with optional filters)
// @access  Admin
router.get("/", protect, async (req, res) => {
  try {
    const { category, condition, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (category) query.category = category;
    if (condition) query.condition = condition;
    if (search) query.name = { $regex: search, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      Equipment.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      Equipment.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/equipment/:id
// @desc    Get single equipment
// @access  Admin
router.get("/:id", protect, async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment)
      return res
        .status(404)
        .json({ success: false, message: "Equipment not found" });
    res.json({ success: true, data: equipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/equipment/:id
// @desc    Update equipment
// @access  Admin
router.put("/:id", protect, async (req, res) => {
  try {
    const equipment = await Equipment.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true },
    );
    if (!equipment)
      return res
        .status(404)
        .json({ success: false, message: "Equipment not found" });
    res.json({ success: true, data: equipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/equipment/:id/maintenance
// @desc    Log maintenance for equipment
// @access  Admin
router.patch("/:id/maintenance", protect, async (req, res) => {
  try {
    const { notes, cost, technician } = req.body;
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment)
      return res
        .status(404)
        .json({ success: false, message: "Equipment not found" });

    equipment.maintenanceLogs.push({
      date: new Date(),
      notes,
      cost: cost || 0,
      technician,
      performedBy: req.admin._id,
    });
    equipment.lastMaintenanceDate = new Date();
    equipment.condition = req.body.newCondition || equipment.condition;
    await equipment.save();

    res.json({ success: true, data: equipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/equipment/:id
// @desc    Delete equipment
// @access  Admin
router.delete("/:id", protect, async (req, res) => {
  try {
    const equipment = await Equipment.findByIdAndDelete(req.params.id);
    if (!equipment)
      return res
        .status(404)
        .json({ success: false, message: "Equipment not found" });
    res.json({ success: true, message: "Equipment deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
