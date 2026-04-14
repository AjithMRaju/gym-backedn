const mongoose = require('mongoose');

const heroSchema = new mongoose.Schema(
  {
    heading:    { type: String, required: true, trim: true },
    subheading: { type: String, trim: true },
    ctaText:    { type: String, default: 'Get Started' },
    ctaLink:    { type: String, default: '#contact' },
    backgroundImage: { type: String }, // file path
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Hero', heroSchema);
