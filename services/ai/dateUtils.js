/**
 * dateUtils.js - Timezone-aware date calculations for gym analytics & voice AI
 */

/**
 * Get date parts (year, month, day, hour, minute, second, dayOfWeek) in a specific IANA timezone.
 */
function getPartsInTz(date, timeZone = "Asia/Kolkata") {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }

  // Weekday mapping
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10), // 1-12
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour === "24" ? "0" : map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dayOfWeek: weekdayMap[map.weekday] ?? 0,
  };
}

/**
 * Creates a UTC Date corresponding to a specific local year, month (1-based), day,
 * hour, minute, second, ms in the given timezone.
 */
function createDateInTz(year, month, day, hour = 0, minute = 0, second = 0, ms = 0, timeZone = "Asia/Kolkata") {
  // Approximate UTC guess
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  
  // Find what the guess resolves to in the target timezone
  const parts = getPartsInTz(guessUtc, timeZone);
  const tzDateAsUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, ms));
  
  // The difference gives the timezone offset at that instant
  const diffMs = tzDateAsUtc.getTime() - guessUtc.getTime();
  
  // Adjust guess by subtracting the offset diff
  const correctedDate = new Date(guessUtc.getTime() - diffMs);
  return correctedDate;
}

/**
 * Formats a Date object to YYYY-MM-DD in the given timezone.
 */
function formatDateInTz(date, timeZone = "Asia/Kolkata") {
  const p = getPartsInTz(date, timeZone);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/**
 * Calculate start and end UTC dates for a named period in the gym's timezone.
 *
 * @param {string} period "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom"
 * @param {object} options
 * @param {Date} [options.now] Reference date (default Date.now())
 * @param {string} [options.timeZone] IANA timezone (default "Asia/Kolkata")
 * @param {number} [options.weekStartsOn] 1 for Monday, 0 for Sunday (default 1)
 * @param {string|Date} [options.startDate] For "custom"
 * @param {string|Date} [options.endDate] For "custom"
 * @returns {{ startDate: Date, endDate: Date, label: string }}
 */
function getPeriodBounds(period, options = {}) {
  const {
    now = new Date(),
    timeZone = "Asia/Kolkata",
    weekStartsOn = 1, // 1 = Monday
    startDate: customStart,
    endDate: customEnd,
  } = options;

  const current = getPartsInTz(now, timeZone);

  let startYear = current.year;
  let startMonth = current.month;
  let startDay = current.day;

  let endYear = current.year;
  let endMonth = current.month;
  let endDay = current.day;

  switch (period) {
    case "today": {
      const startDate = createDateInTz(startYear, startMonth, startDay, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(endYear, endMonth, endDay, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: "today" };
    }

    case "yesterday": {
      // 1 day before in local tz
      const tempDate = new Date(createDateInTz(startYear, startMonth, startDay, 12, 0, 0, 0, timeZone).getTime() - 24 * 3600 * 1000);
      const yParts = getPartsInTz(tempDate, timeZone);
      const startDate = createDateInTz(yParts.year, yParts.month, yParts.day, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(yParts.year, yParts.month, yParts.day, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: "yesterday" };
    }

    case "this_week": {
      // Week starts on Monday (1). Current dayOfWeek (0 = Sun, 1 = Mon ... 6 = Sat)
      const currentDow = current.dayOfWeek;
      const daysSinceStart = (currentDow - weekStartsOn + 7) % 7;
      const daysUntilEnd = 6 - daysSinceStart;

      const midToday = createDateInTz(current.year, current.month, current.day, 12, 0, 0, 0, timeZone);
      const startLocal = new Date(midToday.getTime() - daysSinceStart * 24 * 3600 * 1000);
      const endLocal = new Date(midToday.getTime() + daysUntilEnd * 24 * 3600 * 1000);

      const sp = getPartsInTz(startLocal, timeZone);
      const ep = getPartsInTz(endLocal, timeZone);

      const startDate = createDateInTz(sp.year, sp.month, sp.day, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(ep.year, ep.month, ep.day, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: "this week" };
    }

    case "last_week": {
      const currentDow = current.dayOfWeek;
      const daysSinceStart = (currentDow - weekStartsOn + 7) % 7;
      const midToday = createDateInTz(current.year, current.month, current.day, 12, 0, 0, 0, timeZone);
      
      const startLastWeekLocal = new Date(midToday.getTime() - (daysSinceStart + 7) * 24 * 3600 * 1000);
      const endLastWeekLocal = new Date(midToday.getTime() - (daysSinceStart + 1) * 24 * 3600 * 1000);

      const sp = getPartsInTz(startLastWeekLocal, timeZone);
      const ep = getPartsInTz(endLastWeekLocal, timeZone);

      const startDate = createDateInTz(sp.year, sp.month, sp.day, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(ep.year, ep.month, ep.day, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: "last week" };
    }

    case "this_month": {
      const daysInMonth = new Date(Date.UTC(current.year, current.month, 0)).getUTCDate();
      const startDate = createDateInTz(current.year, current.month, 1, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(current.year, current.month, daysInMonth, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: "this month" };
    }

    case "last_month": {
      let lmYear = current.year;
      let lmMonth = current.month - 1;
      if (lmMonth < 1) {
        lmMonth = 12;
        lmYear -= 1;
      }
      const daysInMonth = new Date(Date.UTC(lmYear, lmMonth, 0)).getUTCDate();
      const startDate = createDateInTz(lmYear, lmMonth, 1, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(lmYear, lmMonth, daysInMonth, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: "last month" };
    }

    case "custom": {
      if (!customStart) {
        throw new Error("startDate is required for custom period");
      }
      const start = new Date(customStart);
      const end = customEnd ? new Date(customEnd) : new Date(now);
      return { startDate: start, endDate: end, label: "custom period" };
    }

    default: {
      // Default to today
      const startDate = createDateInTz(startYear, startMonth, startDay, 0, 0, 0, 0, timeZone);
      const endDate = createDateInTz(endYear, endMonth, endDay, 23, 59, 59, 999, timeZone);
      return { startDate, endDate, label: period };
    }
  }
}

module.exports = {
  getPartsInTz,
  createDateInTz,
  formatDateInTz,
  getPeriodBounds,
};
