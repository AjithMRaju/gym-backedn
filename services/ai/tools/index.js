/**
 * tools/index.js - Unified Registry of AI Assistant Tools
 */

const { schema: revenueSchema, execute: executeRevenue } = require("./revenueTool");
const {
  memberCountsTool,
  newMembersTool,
  expiringMembershipsTool,
  unpaidDuesTool,
} = require("./memberTool");
const { schema: attendanceSchema, execute: executeAttendance } = require("./attendanceTool");

const toolsMap = {
  get_revenue: {
    schema: revenueSchema,
    execute: executeRevenue,
  },
  get_member_counts: {
    schema: memberCountsTool.schema,
    execute: memberCountsTool.execute,
  },
  get_new_members: {
    schema: newMembersTool.schema,
    execute: newMembersTool.execute,
  },
  get_expiring_memberships: {
    schema: expiringMembershipsTool.schema,
    execute: expiringMembershipsTool.execute,
  },
  get_unpaid_dues: {
    schema: unpaidDuesTool.schema,
    execute: unpaidDuesTool.execute,
  },
  get_attendance: {
    schema: attendanceSchema,
    execute: executeAttendance,
  },
};

/**
 * Returns list of tool schemas for Anthropic Messages API.
 */
function getAnthropicTools() {
  return Object.values(toolsMap).map((t) => t.schema);
}

/**
 * Execute a tool call safely with logging and timing.
 * Note: Never log the returned values as per privacy rules.
 */
async function executeTool(name, args, context) {
  const tool = toolsMap[name];
  if (!tool) {
    return {
      error: "unknown_tool",
      message: `Tool '${name}' is not recognized.`,
    };
  }

  const startTime = Date.now();
  try {
    const result = await tool.execute(args, context);
    const duration = Date.now() - startTime;

    // Rule: Log every tool call (tool name, params, user id, duration; NOT the returned values)
    console.log(`[AI Tool Call] tool=${name} userId=${context.user?._id || context.userId} durationMs=${duration} params=${JSON.stringify(args)}`);

    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[AI Tool Error] tool=${name} userId=${context.user?._id || context.userId} durationMs=${duration} error=${err.message}`);
    return {
      error: "execution_error",
      message: err.message,
    };
  }
}

module.exports = {
  toolsMap,
  getAnthropicTools,
  executeTool,
};
