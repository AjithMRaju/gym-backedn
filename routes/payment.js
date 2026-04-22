const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Payment = require("../models/Payment");

// ─── PUBLIC / CLIENT ROUTES ───────────────────────────────────────────────────

// @route   GET /api/payments/client/:clientId
// @desc    Get payments for a specific client (for website account page)
// @access  Public (use client JWT in production)
router.get("/client/:clientId", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [payments, total] = await Promise.all([
      Payment.find({ client: req.params.clientId })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 })
        .populate("plan", "name"),
      Payment.countDocuments({ client: req.params.clientId }),
    ]);

    res.json({ success: true, total, data: payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN ROUTES (protected) ───────────────────────────────────────────────

// @route   POST /api/payments
// @desc    Record a payment
// @access  Admin
router.post("/", protect, async (req, res) => {
  try {
    const {
      clientId,
      planId,
      amount,
      method,
      transactionId,
      notes,
      type,
      status,
    } = req.body;

    if (!clientId || !amount || !method || !type) {
      return res
        .status(400)
        .json({
          success: false,
          message: "clientId, amount, method and type are required",
        });
    }

    const payment = await Payment.create({
      client: clientId,
      plan: planId,
      amount,
      method,
      transactionId,
      notes,
      type,
      status: status || "completed",
      recordedBy: req.admin._id,
    });

    res
      .status(201)
      .json({
        success: true,
        data: await payment.populate(["client", "plan"]),
      });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payments
// @desc    Get all payments (with filters)
// @access  Admin
router.get("/", protect, async (req, res) => {
  try {
    const {
      clientId,
      method,
      status,
      type,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;
    const query = {};
    if (clientId) query.client = clientId;
    if (method) query.method = method;
    if (status) query.status = status;
    if (type) query.type = type;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate("client", "name email phone")
        .populate("plan", "name")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
      Payment.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payments/summary
// @desc    Revenue summary (daily / monthly / yearly)
// @access  Admin
router.get("/summary", protect, async (req, res) => {
  try {
    const { period = "monthly", year = new Date().getFullYear() } = req.query;

    const groupFormat =
      period === "daily"
        ? {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          }
        : period === "monthly"
          ? { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }
          : { year: { $year: "$createdAt" } };

    const summary = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31`),
          },
        },
      },
      {
        $group: {
          _id: groupFormat,
          totalRevenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payments/:id
// @desc    Get single payment
// @access  Admin
router.get("/:id", protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("client", "name email phone")
      .populate("plan", "name");
    if (!payment)
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/payments/:id/status
// @desc    Update payment status (refund / fail)
// @access  Admin
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status, refundReason } = req.body;
    const allowed = ["completed", "pending", "failed", "refunded"];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Status must be one of: ${allowed.join(", ")}`,
        });
    }

    const update = { status };
    if (status === "refunded") update.refundReason = refundReason;

    const payment = await Payment.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!payment)
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
