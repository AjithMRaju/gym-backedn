const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const MembershipPlan = require("../models/MembershipPlan");
const MembershipSubscription = require("../models/MembershipSubscription");
const Client = require("../models/Client");

// ─── PUBLIC ROUTES ───────────────────────────────────────────────────────────

// @route   GET /api/membership/plans/public
// @desc    Get active membership plans for website
// @access  Public
router.get("/plans/public", async (req, res) => {
  try {
    const plans = await MembershipPlan.find({ isActive: true }).select(
      "name price duration durationUnit features description highlight",
    );
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN – PLAN MANAGEMENT ─────────────────────────────────────────────────

// @route   POST /api/membership/plans
// @desc    Create membership plan
// @access  Admin
router.post("/plans", protect, async (req, res) => {
  try {
    const {
      name,
      price,
      duration,
      durationUnit,
      features,
      description,
      highlight,
    } = req.body;
    if (!name || !price || !duration || !durationUnit) {
      return res
        .status(400)
        .json({
          success: false,
          message: "name, price, duration and durationUnit are required",
        });
    }
    const plan = await MembershipPlan.create({
      name,
      price,
      duration,
      durationUnit,
      features,
      description,
      highlight,
      createdBy: req.admin._id,
    });
    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/membership/plans
// @desc    Get all membership plans
// @access  Admin
router.get("/plans", protect, async (req, res) => {
  try {
    const plans = await MembershipPlan.find().sort({ price: 1 });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/membership/plans/:id
// @desc    Update membership plan
// @access  Admin
router.put("/plans/:id", protect, async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/membership/plans/:id
// @desc    Delete membership plan
// @access  Admin
router.delete("/plans/:id", protect, async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndDelete(req.params.id);
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    res.json({ success: true, message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN – SUBSCRIPTION MANAGEMENT ─────────────────────────────────────────

// @route   POST /api/membership/subscriptions
// @desc    Assign membership to a client
// @access  Admin
router.post("/subscriptions", protect, async (req, res) => {
  try {
    const { clientId, planId, startDate, paymentMethod, amountPaid, notes } =
      req.body;
    if (!clientId || !planId || !startDate || !paymentMethod) {
      return res
        .status(400)
        .json({
          success: false,
          message: "clientId, planId, startDate and paymentMethod are required",
        });
    }

    const plan = await MembershipPlan.findById(planId);
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });

    const start = new Date(startDate);
    const end = new Date(start);
    if (plan.durationUnit === "days")
      end.setDate(end.getDate() + plan.duration);
    else if (plan.durationUnit === "months")
      end.setMonth(end.getMonth() + plan.duration);
    else if (plan.durationUnit === "years")
      end.setFullYear(end.getFullYear() + plan.duration);

    const subscription = await MembershipSubscription.create({
      client: clientId,
      plan: planId,
      startDate: start,
      endDate: end,
      paymentMethod,
      amountPaid: amountPaid || plan.price,
      notes,
      status: "active",
      createdBy: req.admin._id,
    });

    await Client.findByIdAndUpdate(clientId, {
      activeMembership: subscription._id,
      status: "active",
    });

    res
      .status(201)
      .json({
        success: true,
        data: await subscription.populate(["client", "plan"]),
      });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/membership/subscriptions
// @desc    Get all subscriptions (with filters)
// @access  Admin
router.get("/subscriptions", protect, async (req, res) => {
  try {
    const { status, clientId, planId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (clientId) query.client = clientId;
    if (planId) query.plan = planId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [subs, total] = await Promise.all([
      MembershipSubscription.find(query)
        .populate("client", "name email phone")
        .populate("plan", "name price duration durationUnit")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      MembershipSubscription.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: subs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/membership/subscriptions/:id
// @desc    Get single subscription
// @access  Admin
router.get("/subscriptions/:id", protect, async (req, res) => {
  try {
    const sub = await MembershipSubscription.findById(req.params.id)
      .populate("client", "name email phone")
      .populate("plan");
    if (!sub)
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/membership/subscriptions/:id/status
// @desc    Update subscription status (pause / cancel / renew)
// @access  Admin
router.patch("/subscriptions/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["active", "paused", "cancelled", "expired"];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Status must be one of: ${allowed.join(", ")}`,
        });
    }
    const sub = await MembershipSubscription.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!sub)
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/membership/expiring
// @desc    Get memberships expiring soon (next N days)
// @access  Admin
router.get("/expiring", protect, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const subs = await MembershipSubscription.find({
      status: "active",
      endDate: { $gte: now, $lte: future },
    })
      .populate("client", "name email phone")
      .populate("plan", "name price");

    res.json({ success: true, count: subs.length, data: subs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
