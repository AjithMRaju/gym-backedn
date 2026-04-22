const mongoose = require("mongoose");

const trainingSessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["group", "personal"] },
    sessionType: {
      type: String,
      enum: [
        "yoga",
        "hiit",
        "crossfit",
        "zumba",
        "pilates",
        "strength",
        "cardio",
        "martial_arts",
        "spinning",
        "other",
      ],
    },
    trainer: { type: mongoose.Schema.Types.ObjectId, ref: "Trainer" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    location: String,
    maxCapacity: { type: Number, default: 20 },
    bookedCount: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    description: String,
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
      default: "scheduled",
    },
    cancelReason: String,
    isRecurring: { type: Boolean, default: false },
    recurringDays: [
      {
        type: String,
        enum: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TrainingSession", trainingSessionSchema);
