const mongoose = require('mongoose');

// Gym's own contact details shown on the website
const contactInfoSchema = new mongoose.Schema(
  {
    phone:    { type: String },
    email:    { type: String },
    address:  { type: String },
    mapEmbed: { type: String }, // Google Maps iframe src
    workingHours: { type: String }, // e.g. "Mon-Sat: 6AM – 10PM"
    socialLinks: {
      facebook:  { type: String },
      instagram: { type: String },
      youtube:   { type: String },
      twitter:   { type: String },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Messages submitted by website visitors
const contactMessageSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true },
    email:   { type: String, required: true, lowercase: true },
    phone:   { type: String },
    subject: { type: String },
    message: { type: String, required: true },
    isRead:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = {
  ContactInfo: mongoose.model('ContactInfo', contactInfoSchema),
  ContactMessage: mongoose.model('ContactMessage', contactMessageSchema),
};
