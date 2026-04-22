const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingSession",
      required: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "attended", "no_show"],
      default: "confirmed",
    },
    attended: { type: Boolean, default: false },
    notes: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Booking", bookingSchema);
