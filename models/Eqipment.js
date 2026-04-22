const mongoose = require("mongoose");

const maintenanceLogSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  notes: String,
  cost: { type: Number, default: 0 },
  technician: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
});

const equipmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: [
        "cardio",
        "strength",
        "flexibility",
        "free_weights",
        "machines",
        "accessories",
        "other",
      ],
    },
    brand: { type: String, trim: true },
    model: String,
    serialNumber: { type: String, unique: true, sparse: true },
    purchaseDate: Date,
    purchasePrice: Number,
    condition: {
      type: String,
      enum: ["excellent", "good", "fair", "needs_repair", "out_of_service"],
      default: "good",
    },
    location: String,
    description: String,
    image: String,
    maintenanceIntervalDays: { type: Number, default: 90 },
    lastMaintenanceDate: Date,
    maintenanceLogs: [maintenanceLogSchema],
    status: {
      type: String,
      enum: ["available", "in_use", "maintenance"],
      default: "available",
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Equipment", equipmentSchema);
