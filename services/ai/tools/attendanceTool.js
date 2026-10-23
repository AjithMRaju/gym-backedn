/**
 * attendanceTool.js - Attendance & check-in analytics for Voice AI Assistant
 */

const Booking = require("../../../models/Booking");
const TrainingSession = require("../../../models/TrainingSession");
const GymSettings = require("../../../models/GymSettings");
const { getPeriodBounds, formatDateInTz, getPartsInTz } = require("../dateUtils");

const schema = {
  name: "get_attendance",
  description: "Get total check-ins/attendance count and busiest day/hour for a given period.",
  input_schema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"],
        description: "Period to analyze attendance. Defaults to this_week.",
      },
    },
  },
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function execute(args, context) {
  const { gymId = "default" } = context;
  const gymSettings = await GymSettings.findOne({ gym_id: gymId }).lean();
  const timeZone = gymSettings?.timezone || "Asia/Kolkata";

  const period = args.period || "this_week";
  const bounds = getPeriodBounds(period, { timeZone });

  // Find bookings marked attended in this period
  const attendedBookings = await Booking.find({
    $or: [{ status: "attended" }, { attended: true }],
    updatedAt: { $gte: bounds.startDate, $lte: bounds.endDate },
  })
    .populate("session", "startTime title")
    .lean();

  const totalCheckIns = attendedBookings.length;

  if (totalCheckIns === 0) {
    return {
      period,
      startDate: formatDateInTz(bounds.startDate, timeZone),
      endDate: formatDateInTz(bounds.endDate, timeZone),
      totalCheckIns: 0,
      busiestDay: "None",
      busiestHour: "None",
    };
  }

  // Count by day and by hour in gym timezone
  const dayCounts = {};
  const hourCounts = {};

  for (const b of attendedBookings) {
    const refDate = b.session?.startTime ? new Date(b.session.startTime) : new Date(b.updatedAt);
    const parts = getPartsInTz(refDate, timeZone);
    const dayName = DAY_NAMES[parts.dayOfWeek] || "Unknown";
    const hourKey = `${String(parts.hour).padStart(2, "0")}:00`;

    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
  }

  let busiestDay = "None";
  let maxDayCount = 0;
  for (const [day, count] of Object.entries(dayCounts)) {
    if (count > maxDayCount) {
      maxDayCount = count;
      busiestDay = day;
    }
  }

  let busiestHour = "None";
  let maxHourCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > maxHourCount) {
      maxHourCount = count;
      busiestHour = hour;
    }
  }

  return {
    period,
    startDate: formatDateInTz(bounds.startDate, timeZone),
    endDate: formatDateInTz(bounds.endDate, timeZone),
    totalCheckIns,
    busiestDay: maxDayCount > 0 ? `${busiestDay} (${maxDayCount} check-ins)` : "None",
    busiestHour: maxHourCount > 0 ? `${busiestHour} (${maxHourCount} check-ins)` : "None",
  };
}

module.exports = {
  schema,
  execute,
};
