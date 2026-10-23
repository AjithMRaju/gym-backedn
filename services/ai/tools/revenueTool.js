/**
 * revenueTool.js - Revenue queries for Voice AI Assistant
 */

const Payment = require("../../../models/Payment");
const GymSettings = require("../../../models/GymSettings");
const { getPeriodBounds, formatDateInTz } = require("../dateUtils");

const schema = {
  name: "get_revenue",
  description: "Calculate total gym revenue for a given time period (today, yesterday, this_week, last_week, this_month, last_month, custom). Only authorized owners/managers can access this data.",
  input_schema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom"],
        description: "The time period to analyze. Defaults to this_week.",
      },
      startDate: {
        type: "string",
        description: "ISO start date if period is custom (e.g. '2026-10-01')",
      },
      endDate: {
        type: "string",
        description: "ISO end date if period is custom (e.g. '2026-10-25')",
      },
      groupBy: {
        type: "string",
        enum: ["day", "none"],
        description: "Whether to group totals by day. Defaults to none.",
      },
    },
  },
};

/**
 * Execute get_revenue tool.
 */
async function execute(args, context) {
  const { user, gymId = "default" } = context;

  // Role permissions check: only superadmin (Owner/Manager) can access financial revenue figures
  if (!user || user.role !== "superadmin") {
    return {
      error: "forbidden",
      message: `User role '${user?.role || "staff"}' is not permitted to view financial revenue data.`,
    };
  }

  // Load gym settings for timezone & currency
  const gymSettings = await GymSettings.findOne({ gym_id: gymId }).lean();
  const timeZone = gymSettings?.timezone || "Asia/Kolkata";
  const currency = gymSettings?.currency || "INR";

  const period = args.period || "this_week";
  const bounds = getPeriodBounds(period, {
    timeZone,
    startDate: args.startDate,
    endDate: args.endDate,
  });

  const queryMatch = {
    createdAt: { $gte: bounds.startDate, $lte: bounds.endDate },
    status: "completed",
  };

  // Cross-tenant filter if payments have gymId / recordedBy
  // If Payment has gymId, filter by gymId.
  if (Payment.schema.paths.gymId) {
    queryMatch.gymId = gymId;
  }

  const [completedPayments, refundedPayments] = await Promise.all([
    Payment.find(queryMatch).lean(),
    Payment.find({
      createdAt: { $gte: bounds.startDate, $lte: bounds.endDate },
      status: "refunded",
      ...(Payment.schema.paths.gymId ? { gymId } : {}),
    }).lean(),
  ]);

  const grossTotal = completedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const refundTotal = refundedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const netTotal = grossTotal - refundTotal;
  const paymentCount = completedPayments.length;

  const result = {
    period,
    startDate: formatDateInTz(bounds.startDate, timeZone),
    endDate: formatDateInTz(bounds.endDate, timeZone),
    total: Math.max(0, netTotal),
    grossTotal,
    refundTotal,
    currency,
    paymentCount,
  };

  if (args.groupBy === "day") {
    const byDayMap = {};
    for (const p of completedPayments) {
      const dayKey = formatDateInTz(new Date(p.createdAt), timeZone);
      if (!byDayMap[dayKey]) {
        byDayMap[dayKey] = { date: dayKey, total: 0, count: 0 };
      }
      byDayMap[dayKey].total += Number(p.amount) || 0;
      byDayMap[dayKey].count += 1;
    }
    result.byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));
  }

  return result;
}

module.exports = {
  schema,
  execute,
};
