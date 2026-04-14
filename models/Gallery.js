const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema(
  {
    title:    { type: String, trim: true },
    caption:  { type: String },
    imageUrl: { type: String, required: true }, // file path
    category: {
      type: String,
      enum: ['gym', 'classes', 'equipment', 'events', 'other'],
      default: 'gym',
    },
    order:    { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gallery', gallerySchema);
