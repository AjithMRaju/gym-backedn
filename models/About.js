const mongoose = require('mongoose');

const aboutSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    mission:     { type: String },
    vision:      { type: String },
    image:       { type: String }, // file path
    stats: [
      {
        label: { type: String }, // e.g. "Members"
        value: { type: String }, // e.g. "500+"
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('About', aboutSchema);
