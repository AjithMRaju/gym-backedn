const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const TrainingSession = require("../models/TrainingSession");
const Booking = require("../models/Booking");

// ─── PUBLIC ROUTES ───────────────────────────────────────────────────────────

// @route   GET /api/sessions/public
// @desc    Get upcoming public class schedules for website
// @access  Public
router.get("/public", async (req, res) => {
  try {
    const now = new Date();
    const { from, to, type } = req.query;
    const query = {
      type: "group",
      status: "scheduled",
      startTime: { $gte: from ? new Date(from) : now },
    };
    if (to) query.startTime.$lte = new Date(to);
    if (type) query.sessionType = type;

    const sessions = await TrainingSession.find(query)
      .select(
        "title sessionType startTime endTime trainer location maxCapacity bookedCount description",
      )
      .populate("trainer", "name photo specializations")
      .sort({ startTime: 1 })
      .limit(50);

    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/sessions/:id/book
// @desc    Book a group class (website)
// @access  Public (use client JWT in production)
router.post("/:id/book", async (req, res) => {
  try {
    const { clientId, notes } = req.body;
    if (!clientId)
      return res
        .status(400)
        .json({ success: false, message: "clientId is required" });

    const session = await TrainingSession.findById(req.params.id);
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    if (session.bookedCount >= session.maxCapacity) {
      return res
        .status(409)
        .json({ success: false, message: "Session is fully booked" });
    }

    const alreadyBooked = await Booking.findOne({
      session: session._id,
      client: clientId,
      status: { $ne: "cancelled" },
    });
    if (alreadyBooked)
      return res
        .status(409)
        .json({ success: false, message: "Already booked for this session" });

    const booking = await Booking.create({
      session: session._id,
      client: clientId,
      notes,
      status: "confirmed",
    });

    await TrainingSession.findByIdAndUpdate(req.params.id, {
      $inc: { bookedCount: 1 },
    });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/sessions/:id/book/:bookingId
// @desc    Cancel a booking (website)
// @access  Public (use client JWT in production)
router.delete("/:id/book/:bookingId", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });

    booking.status = "cancelled";
    await booking.save();
    await TrainingSession.findByIdAndUpdate(req.params.id, {
      $inc: { bookedCount: -1 },
    });

    res.json({ success: true, message: "Booking cancelled" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN ROUTES (protected) ───────────────────────────────────────────────

// @route   POST /api/sessions
// @desc    Create training session / class
// @access  Admin
router.post("/", protect, async (req, res) => {
  try {
    const {
      title,
      type,
      sessionType,
      trainer,
      startTime,
      endTime,
      location,
      maxCapacity,
      description,
      isRecurring,
      recurringDays,
      price,
    } = req.body;

    if (!title || !type || !startTime || !endTime) {
      return res
        .status(400)
        .json({
          success: false,
          message: "title, type, startTime and endTime are required",
        });
    }

    const session = await TrainingSession.create({
      title,
      type,
      sessionType,
      trainer,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      location,
      maxCapacity: maxCapacity || 20,
      description,
      isRecurring,
      recurringDays,
      price,
      createdBy: req.admin._id,
    });

    res
      .status(201)
      .json({
        success: true,
        data: await session.populate("trainer", "name email"),
      });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/sessions
// @desc    Get all sessions
// @access  Admin
router.get("/", protect, async (req, res) => {
  try {
    const {
      type,
      trainerId,
      status,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;
    const query = {};
    if (type) query.type = type;
    if (trainerId) query.trainer = trainerId;
    if (status) query.status = status;
    if (from || to) {
      query.startTime = {};
      if (from) query.startTime.$gte = new Date(from);
      if (to) query.startTime.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [sessions, total] = await Promise.all([
      TrainingSession.find(query)
        .populate("trainer", "name email")
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ startTime: 1 }),
      TrainingSession.countDocuments(query),
    ]);

    res.json({ success: true, total, page: parseInt(page), data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/sessions/:id
// @desc    Get single session with bookings
// @access  Admin
router.get("/:id", protect, async (req, res) => {
  try {
    const session = await TrainingSession.findById(req.params.id).populate(
      "trainer",
      "name email phone",
    );
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    const bookings = await Booking.find({ session: req.params.id }).populate(
      "client",
      "name email phone",
    );

    res.json({ success: true, data: { session, bookings } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/sessions/:id
// @desc    Update session
// @access  Admin
router.put("/:id", protect, async (req, res) => {
  try {
    const session = await TrainingSession.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true },
    ).populate("trainer", "name email");
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/sessions/:id/status
// @desc    Cancel / complete / reschedule session
// @access  Admin
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status, cancelReason } = req.body;
    const allowed = ["scheduled", "in_progress", "completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Status must be one of: ${allowed.join(", ")}`,
        });
    }

    const update = { status };
    if (status === "cancelled") update.cancelReason = cancelReason;

    const session = await TrainingSession.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true },
    );
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/sessions/:id
// @desc    Delete session
// @access  Admin
router.delete("/:id", protect, async (req, res) => {
  try {
    const session = await TrainingSession.findByIdAndDelete(req.params.id);
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    res.json({ success: true, message: "Session deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/sessions/:id/bookings
// @desc    Get all bookings for a session
// @access  Admin
router.get("/:id/bookings", protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ session: req.params.id }).populate(
      "client",
      "name email phone",
    );
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/sessions/bookings/:bookingId/attendance
// @desc    Mark attendance for a booking
// @access  Admin
router.patch("/bookings/:bookingId/attendance", protect, async (req, res) => {
  try {
    const { attended } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.bookingId,
      { attended, status: attended ? "attended" : "no_show" },
      { new: true },
    );
    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    res.json({ success: true, data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
