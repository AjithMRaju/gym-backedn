const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    icon:        { type: String },   // icon class name (e.g. FontAwesome) or SVG string
    image:       { type: String },   // file path
    price:       { type: String },   // e.g. "₹999/month"
    duration:    { type: String },   // e.g. "60 min"
    order:       { type: Number, default: 0 },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Service', serviceSchema);
