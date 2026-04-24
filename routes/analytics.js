const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

const Client = require("../models/Client");
const Payment = require("../models/Payment");
const MembershipSubscription = require("../models/MembershipSubscription");
const MembershipPlan = require("../models/MembershipPlan");
const TrainingSession = require("../models/TrainingSession");
const Booking = require("../models/Booking");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns { start, end } for a given month offset (0 = current month). */
function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + offset + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

/** Safe percentage change: ((curr - prev) / prev) * 100 */
function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
}

// ─── GET /api/analytics/dashboard ────────────────────────────────────────────
// Returns all data needed by the dashboard page in one request.
// @access  Admin (protected)
router.get("/dashboard", protect, async (req, res) => {
  try {
    const { start: currStart, end: currEnd } = monthRange(0);
    const { start: prevStart, end: prevEnd } = monthRange(-1);

    // ── 1. SECTION CARDS ──────────────────────────────────────────────────────

    // Total Revenue – current & previous month
    const [revCurr, revPrev] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: currStart, $lte: currEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: prevStart, $lte: prevEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);
    const totalRevenue = revCurr[0]?.total ?? 0;
    const prevRevenue = revPrev[0]?.total ?? 0;
    const revenueChange = pctChange(totalRevenue, prevRevenue);

    // New Customers – clients registered this vs last month
    const [newCurrCount, newPrevCount] = await Promise.all([
      Client.countDocuments({ createdAt: { $gte: currStart, $lte: currEnd } }),
      Client.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
    ]);
    const newCustomersChange = pctChange(newCurrCount, newPrevCount);

    // Active Accounts – clients with status "active"
    const [activeCurr, activePrev] = await Promise.all([
      Client.countDocuments({ status: "active" }),
      // Approximate "previous" active count: subtract this month's new actives
      Client.countDocuments({
        status: "active",
        createdAt: { $lt: currStart },
      }),
    ]);
    const activeAccountsChange = pctChange(activeCurr, activePrev);

    // Growth Rate – MoM revenue growth as a percentage value
    const growthRate = revenueChange; // reuse revenue MoM growth

    // ── 2. CHART DATA – last 6 months revenue + new members ──────────────────

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [revenueByMonth, clientsByMonth] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Client.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            newClients: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    // Build a unified 6-month chart array
    const MONTH_NAMES = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const chartMap = {};

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      chartMap[key] = {
        month: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear(),
        revenue: 0,
        newMembers: 0,
      };
    }

    revenueByMonth.forEach(({ _id, revenue }) => {
      const key = `${_id.year}-${_id.month}`;
      if (chartMap[key]) chartMap[key].revenue = revenue;
    });

    clientsByMonth.forEach(({ _id, newClients }) => {
      const key = `${_id.year}-${_id.month}`;
      if (chartMap[key]) chartMap[key].newMembers = newClients;
    });

    const chartData = Object.values(chartMap);

    // ── 3. RECENT SUBSCRIPTIONS TABLE ─────────────────────────────────────────
    // Maps to DataTable: header=clientName, type=planName, status=subscription status,
    // target=endDate, limit=amountPaid, reviewer=paymentMethod

    const recentSubscriptions = await MembershipSubscription.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("client", "name email phone")
      .populate("plan", "name price duration durationUnit");

    const tableData = recentSubscriptions.map((sub, idx) => ({
      id: idx + 1,
      subscriptionId: sub._id,
      header: sub.client?.name ?? "Unknown",
      email: sub.client?.email ?? "",
      type: sub.plan?.name ?? "N/A",
      status: sub.status === "active" ? "Done" : "In Progress",
      subscriptionStatus: sub.status,
      target: sub.endDate
        ? new Date(sub.endDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "N/A",
      limit: `$${sub.amountPaid ?? sub.plan?.price ?? 0}`,
      reviewer: sub.paymentMethod ?? "N/A",
    }));

    // ── 4. EXTRA STATS ────────────────────────────────────────────────────────

    const [
      totalClients,
      activeSubscriptions,
      upcomingSessionsCount,
      unreadMessages,
    ] = await Promise.all([
      Client.countDocuments(),
      MembershipSubscription.countDocuments({ status: "active" }),
      TrainingSession.countDocuments({
        status: "scheduled",
        startTime: { $gte: new Date() },
      }),
      // ContactMessage only if model is available — graceful fallback
      Promise.resolve(0),
    ]);

    // ── RESPONSE ──────────────────────────────────────────────────────────────

    res.json({
      success: true,
      data: {
        cards: {
          totalRevenue: {
            value: totalRevenue,
            previousValue: prevRevenue,
            change: revenueChange,
            trend: revenueChange >= 0 ? "up" : "down",
          },
          newCustomers: {
            value: newCurrCount,
            previousValue: newPrevCount,
            change: newCustomersChange,
            trend: newCustomersChange >= 0 ? "up" : "down",
          },
          activeAccounts: {
            value: activeCurr,
            previousValue: activePrev,
            change: activeAccountsChange,
            trend: activeAccountsChange >= 0 ? "up" : "down",
          },
          growthRate: {
            value: growthRate,
            trend: growthRate >= 0 ? "up" : "down",
          },
        },
        chartData, // [{month, year, revenue, newMembers}] × 6
        tableData, // [{id, header, type, status, target, limit, reviewer}]
        extras: {
          totalClients,
          activeSubscriptions,
          upcomingSessionsCount,
        },
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/analytics/revenue ───────────────────────────────────────────────
// Granular revenue chart — supports ?period=daily|monthly|yearly&year=YYYY
// @access  Admin (protected)
router.get("/revenue", protect, async (req, res) => {
  try {
    const {
      period = "monthly",
      year = new Date().getFullYear(),
      months = 6,
    } = req.query;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months) + 1);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const groupId =
      period === "daily"
        ? {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          }
        : period === "yearly"
          ? { year: { $year: "$createdAt" } }
          : { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } };

    const data = await Payment.aggregate([
      { $match: { status: "completed", createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: "$amount" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/analytics/members ───────────────────────────────────────────────
// Member growth over last N months
// @access  Admin (protected)
router.get("/members", protect, async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months) + 1);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const data = await Client.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          newMembers: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
