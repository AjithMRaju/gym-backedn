const mongoose = require("mongoose");

const trainerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true },
    password: { type: String, minlength: 6, select: false },
    photo: String,
    bio: String,
    experience: Number,
    specializations: [String],
    certifications: [{ name: String, issuedBy: String, year: Number }],
    schedule: [
      {
        day: {
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
        startTime: String,
        endTime: String,
      },
    ],
    salary: Number,
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "inactive", "on_leave"],
      default: "active",
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

const bcrypt = require("bcryptjs");

trainerSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

trainerSchema.methods.matchPassword = async function (plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("Trainer", trainerSchema);
