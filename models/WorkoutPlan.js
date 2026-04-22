const mongoose = require("mongoose");

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sets: Number,
  reps: String,
  restSeconds: Number,
  duration: String,
  notes: String,
  videoUrl: String,
});

const daySchema = new mongoose.Schema({
  dayNumber: { type: Number, required: true },
  title: String,
  focus: String,
  exercises: [exerciseSchema],
  restDay: { type: Boolean, default: false },
});

const workoutPlanSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    level: {
      type: String,
      required: true,
      enum: ["beginner", "intermediate", "advanced"],
    },
    goal: {
      type: String,
      required: true,
      enum: [
        "weight_loss",
        "muscle_gain",
        "endurance",
        "flexibility",
        "general_fitness",
        "strength",
      ],
    },
    durationWeeks: Number,
    description: String,
    thumbnail: String,
    tags: [String],
    days: [daySchema],
    isPublic: { type: Boolean, default: false },
    assignedClient: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WorkoutPlan", workoutPlanSchema);
