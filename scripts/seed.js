/**
 * Seed script — run once to create the first superadmin and sample content.
 * Usage:  node scripts/seed.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const Hero = require("../models/Hero");
const About = require("../models/About");
const Service = require("../models/Service");
const { ContactInfo } = require("../models/Contact");

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // ── Admin ──────────────────────────────────────────────────────────────────
  const existing = await Admin.findOne({ email: "admin@gym.com" });
  if (!existing) {
    const admin = new Admin({
      name: "Super Admin",
      email: "admin@gym.com",
      password: "Admin@123",
      role: "superadmin",
    });
    await admin.save();
    console.log("👤 Admin created  →  admin@gym.com / Admin@123");
  } else {
    console.log("👤 Admin already exists, skipping");
  }

  // ── Hero ───────────────────────────────────────────────────────────────────
  await Hero.deleteMany({});
  await Hero.create({
    heading: "Transform Your Body. Transform Your Life.",
    subheading:
      "State-of-the-art equipment, expert trainers, and a community that pushes you further.",
    ctaText: "Start Free Trial",
    ctaLink: "#contact",
    isActive: true,
  });
  console.log("🦸 Hero section seeded");

  // ── About ──────────────────────────────────────────────────────────────────
  await About.deleteMany({});
  await About.create({
    title: "About Our Gym",
    description:
      "Founded in 2010, we have been helping members achieve their fitness goals with world-class facilities and personalised training programs.",
    mission: "To empower every individual to live a stronger, healthier life.",
    vision: "To be the most trusted fitness destination in the region.",
    stats: [
      { label: "Members", value: "1,200+" },
      { label: "Expert Trainers", value: "25+" },
      { label: "Years of Experience", value: "14+" },
      { label: "Classes per Week", value: "50+" },
    ],
    isActive: true,
  });
  console.log("📖 About section seeded");

  // ── Services ───────────────────────────────────────────────────────────────
  await Service.deleteMany({});
  await Service.insertMany([
    {
      title: "Personal Training",
      description:
        "One-on-one sessions with certified trainers tailored to your goals.",
      price: "₹2,999/month",
      duration: "60 min",
      order: 1,
    },
    {
      title: "Group Fitness Classes",
      description: "High-energy classes including Zumba, HIIT, and Yoga.",
      price: "₹1,499/month",
      duration: "45 min",
      order: 2,
    },
    {
      title: "Strength & Conditioning",
      description:
        "Build muscle and improve athletic performance with structured programs.",
      price: "₹1,999/month",
      duration: "60 min",
      order: 3,
    },
    {
      title: "Cardio Zone",
      description:
        "Latest treadmills, ellipticals, and bikes for effective cardio workouts.",
      price: "Included",
      duration: "Unlimited",
      order: 4,
    },
  ]);
  console.log("💪 Services seeded");

  // ── Contact Info ───────────────────────────────────────────────────────────
  await ContactInfo.deleteMany({});
  await ContactInfo.create({
    phone: "+91 98765 43210",
    email: "info@yourgym.com",
    address: "MG Road, Thrissur, Kerala – 680001",
    workingHours: "Mon–Sat: 5:30 AM – 10:00 PM  |  Sun: 7:00 AM – 8:00 PM",
    socialLinks: {
      instagram: "https://instagram.com/yourgym",
      facebook: "https://facebook.com/yourgym",
    },
    isActive: true,
  });
  console.log("📞 Contact info seeded");

  await mongoose.disconnect();
  console.log("\n✅ Seeding complete!");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
