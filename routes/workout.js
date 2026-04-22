const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const WorkoutPlan = require("../models/WorkoutPlan");

// ─── PUBLIC ROUTES ───────────────────────────────────────────────────────────

// @route   GET /api/workouts/public
// @desc    Get public/featured workout plans for website
// @access  Public
router.get("/public", async (req, res) => {
  try {
    const { level, goal, page = 1, limit = 12 } = req.query;
    const query = { isPublic: true };
    if (level) query.level = level;
    if (goal) query.goal = goal;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [plans, total] = await Promise.all([
      WorkoutPlan.find(query)
        .select("title level goal durationWeeks description thumbnail tags")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      WorkoutPlan.countDocuments(query),
    ]);

    res.json({ success: true, total, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/workouts/public/:id
// @desc    Get single public workout plan detail
// @access  Public
router.get("/public/:id", async (req, res) => {
  try {
    const plan = await WorkoutPlan.findOne({
      _id: req.params.id,
      isPublic: true,
    }).populate("createdBy", "name");
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Workout plan not found" });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN ROUTES (protected) ───────────────────────────────────────────────

// @route   POST /api/workouts
// @desc    Create workout plan
// @access  Admin
router.post("/", protect, async (req, res) => {
  try {
    const {
      title,
      level,
      goal,
      durationWeeks,
      description,
      days,
      isPublic,
      tags,
      thumbnail,
      targetClientId,
    } = req.body;

    if (!title || !level || !goal) {
      return res
        .status(400)
        .json({
          success: false,
          message: "title, level and goal are required",
        });
    }

    const plan = await WorkoutPlan.create({
      title,
      level,
      goal,
      durationWeeks,
      description,
      days: days || [],
      isPublic: isPublic || false,
      tags,
      thumbnail,
      assignedClient: targetClientId || null,
      createdBy: req.admin._id,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/workouts
// @desc    Get all workout plans
// @access  Admin
router.get("/", protect, async (req, res) => {
  try {
    const { level, goal, isPublic, clientId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (level) query.level = level;
    if (goal) query.goal = goal;
    if (isPublic !== undefined) query.isPublic = isPublic === "true";
    if (clientId) query.assignedClient = clientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [plans, total] = await Promise.all([
      WorkoutPlan.find(query)
        .populate("assignedClient", "name email")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      WorkoutPlan.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/workouts/:id
// @desc    Get single workout plan (full detail)
// @access  Admin
router.get("/:id", protect, async (req, res) => {
  try {
    const plan = await WorkoutPlan.findById(req.params.id)
      .populate("assignedClient", "name email")
      .populate("createdBy", "name");
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Workout plan not found" });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/workouts/:id
// @desc    Update workout plan
// @access  Admin
router.put("/:id", protect, async (req, res) => {
  try {
    const plan = await WorkoutPlan.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true },
    );
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Workout plan not found" });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/workouts/:id/assign
// @desc    Assign workout plan to a client
// @access  Admin
router.patch("/:id/assign", protect, async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId)
      return res
        .status(400)
        .json({ success: false, message: "clientId is required" });

    const plan = await WorkoutPlan.findByIdAndUpdate(
      req.params.id,
      { assignedClient: clientId },
      { new: true },
    ).populate("assignedClient", "name email");

    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Workout plan not found" });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/workouts/:id
// @desc    Delete workout plan
// @access  Admin
router.delete("/:id", protect, async (req, res) => {
  try {
    const plan = await WorkoutPlan.findByIdAndDelete(req.params.id);
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Workout plan not found" });
    res.json({ success: true, message: "Workout plan deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
