/**
 * memberTool.js - Member and Subscription queries for Voice AI Assistant
 */

const Client = require("../../../models/Client");
const MembershipSubscription = require("../../../models/MembershipSubscription");
const Payment = require("../../../models/Payment");
const GymSettings = require("../../../models/GymSettings");
const { getPeriodBounds, formatDateInTz } = require("../dateUtils");

// ── 1. get_member_counts ───────────────────────────────────────────────────────
const memberCountsSchema = {
  name: "get_member_counts",
  description: "Get counts of members filtered by membership/account status (active, expired, frozen, or all).",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "expired", "frozen", "all"],
        description: "Status to filter by. Defaults to all.",
      },
    },
  },
};

async function executeMemberCounts(args, context) {
  const { gymId = "default" } = context;

  const [activeClients, inactiveClients, suspendedClients, activeSubs, expiredSubs, pausedSubs] = await Promise.all([
    Client.countDocuments({ status: "active" }),
    Client.countDocuments({ status: "inactive" }),
    Client.countDocuments({ status: "suspended" }),
    MembershipSubscription.countDocuments({ status: "active" }),
    MembershipSubscription.countDocuments({ status: "expired" }),
    MembershipSubscription.countDocuments({ status: "paused" }),
  ]);

  const totalClients = activeClients + inactiveClients + suspendedClients;

  const counts = {
    totalMembers: totalClients,
    activeMembers: activeClients,
    inactiveMembers: inactiveClients,
    suspendedMembers: suspendedClients,
    activeSubscriptions: activeSubs,
    expiredMemberships: expiredSubs,
    frozenMemberships: pausedSubs,
  };

  if (args.status === "active") {
    return { status: "active", count: activeClients, subscriptionCount: activeSubs };
  }
  if (args.status === "expired") {
    return { status: "expired", count: expiredSubs };
  }
  if (args.status === "frozen") {
    return { status: "frozen", count: pausedSubs };
  }

  return counts;
}

// ── 2. get_new_members ─────────────────────────────────────────────────────────
const newMembersSchema = {
  name: "get_new_members",
  description: "Get the count and recent list of newly registered members within a specific time period.",
  input_schema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"],
        description: "Time period to look for new members. Defaults to this_week.",
      },
    },
  },
};

async function executeNewMembers(args, context) {
  const { gymId = "default" } = context;
  const gymSettings = await GymSettings.findOne({ gym_id: gymId }).lean();
  const timeZone = gymSettings?.timezone || "Asia/Kolkata";

  const period = args.period || "this_week";
  const bounds = getPeriodBounds(period, { timeZone });

  const [count, recentClients] = await Promise.all([
    Client.countDocuments({ createdAt: { $gte: bounds.startDate, $lte: bounds.endDate } }),
    Client.find({ createdAt: { $gte: bounds.startDate, $lte: bounds.endDate } })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return {
    period,
    startDate: formatDateInTz(bounds.startDate, timeZone),
    endDate: formatDateInTz(bounds.endDate, timeZone),
    newMemberCount: count,
    members: recentClients.map((c) => ({
      name: c.name,
      registeredDate: formatDateInTz(new Date(c.createdAt), timeZone),
    })),
  };
}

// ── 3. get_expiring_memberships ───────────────────────────────────────────────
const expiringMembershipsSchema = {
  name: "get_expiring_memberships",
  description: "Find memberships expiring soon within the specified number of days (1 to 30 days).",
  input_schema: {
    type: "object",
    properties: {
      withinDays: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        description: "Number of days from now to check for expirations (default 7).",
      },
    },
  },
};

async function executeExpiringMemberships(args, context) {
  const { gymId = "default" } = context;
  const days = Math.min(Math.max(parseInt(args.withinDays, 10) || 7, 1), 30);

  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const filter = {
    status: "active",
    endDate: { $gte: now, $lte: future },
  };

  const [count, expiringSubs] = await Promise.all([
    MembershipSubscription.countDocuments(filter),
    MembershipSubscription.find(filter)
      .populate("client", "name")
      .populate("plan", "name")
      .sort({ endDate: 1 })
      .limit(10)
      .lean(),
  ]);

  return {
    withinDays: days,
    expiringCount: count,
    members: expiringSubs.map((sub) => ({
      memberName: sub.client?.name || "Unknown",
      plan: sub.plan?.name || "Membership",
      expiryDate: sub.endDate ? sub.endDate.toISOString().split("T")[0] : null,
    })),
  };
}

// ── 4. get_unpaid_dues ────────────────────────────────────────────────────────
const unpaidDuesSchema = {
  name: "get_unpaid_dues",
  description: "Get total unpaid/pending dues and count of pending payment transactions.",
  input_schema: {
    type: "object",
    properties: {},
  },
};

async function executeUnpaidDues(args, context) {
  const { gymId = "default" } = context;
  const gymSettings = await GymSettings.findOne({ gym_id: gymId }).lean();
  const currency = gymSettings?.currency || "INR";

  const pendingPayments = await Payment.find({ status: "pending" })
    .populate("client", "name")
    .limit(10)
    .lean();

  const totalPendingDoc = await Payment.aggregate([
    { $match: { status: "pending" } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  const totalAmount = totalPendingDoc[0]?.total || 0;
  const count = totalPendingDoc[0]?.count || 0;

  return {
    totalUnpaidAmount: totalAmount,
    currency,
    pendingTransactionsCount: count,
    samplePending: pendingPayments.map((p) => ({
      clientName: p.client?.name || "Unknown",
      amount: p.amount,
      type: p.type,
      date: p.createdAt ? p.createdAt.toISOString().split("T")[0] : null,
    })),
  };
}

module.exports = {
  memberCountsTool: {
    schema: memberCountsSchema,
    execute: executeMemberCounts,
  },
  newMembersTool: {
    schema: newMembersSchema,
    execute: executeNewMembers,
  },
  expiringMembershipsTool: {
    schema: expiringMembershipsSchema,
    execute: executeExpiringMemberships,
  },
  unpaidDuesTool: {
    schema: unpaidDuesSchema,
    execute: executeUnpaidDues,
  },
};
