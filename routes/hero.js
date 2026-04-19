const router = require("express").Router();
const Hero = require("../models/Hero");
const { protect } = require("../middleware/auth");
const { createUploader, deleteFromCloudinary } = require("../config/upload");

const upload = createUploader("hero", true); // true = allow video

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

// GET /api/hero  →  active hero content for the website
router.get("/", async (req, res) => {
  try {
    const hero = await Hero.findOne({ isActive: true }).sort({ updatedAt: -1 });
    res.json({ success: true, data: hero });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hero/all  →  all hero records (for dashboard list)
router.get("/all", protect, async (req, res) => {
  try {
    const heroes = await Hero.find().sort({ updatedAt: -1 });
    res.json({ success: true, data: heroes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/hero
router.post(
  "/",
  protect,
  upload.fields([
    { name: "backgroundImage", maxCount: 1 },
    { name: "backgroundVideo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { heading, subheading, ctaText, ctaLink, isActive } = req.body;

      let imageUrl = req.files["backgroundImage"]
        ? req.files["backgroundImage"][0].path // Cloudinary URL
        : undefined;
      let videoUrl = req.files["backgroundVideo"]
        ? req.files["backgroundVideo"][0].path // Cloudinary URL
        : undefined;

      // Enforce mutual exclusivity: if both are sent, prioritize video
      if (videoUrl && imageUrl) {
        await deleteFromCloudinary(imageUrl, "image"); // delete the extra from Cloudinary
        imageUrl = undefined;
      }

      if (isActive === "true" || isActive === true) {
        await Hero.updateMany({}, { isActive: false });
      }

      const hero = await Hero.create({
        heading,
        subheading,
        ctaText,
        ctaLink,
        backgroundImage: imageUrl,
        backgroundVideo: videoUrl,
        mediaType: videoUrl ? "video" : "image",
        isActive: isActive === "true" || isActive === true,
      });

      res.status(201).json({ success: true, data: hero });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// PUT /api/hero/:id
router.put(
  "/:id",
  protect,
  upload.fields([
    { name: "backgroundImage", maxCount: 1 },
    { name: "backgroundVideo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const hero = await Hero.findById(req.params.id);
      if (!hero)
        return res.status(404).json({ success: false, message: "Hero not found" });

      const { heading, subheading, ctaText, ctaLink, isActive } = req.body;

      const newImage = req.files["backgroundImage"]?.[0]?.path; // Cloudinary URL
      const newVideo = req.files["backgroundVideo"]?.[0]?.path; // Cloudinary URL

      if (newImage || newVideo) {
        // 1. Delete ALL old media files from Cloudinary
        if (hero.backgroundImage) await deleteFromCloudinary(hero.backgroundImage, "image");
        if (hero.backgroundVideo) await deleteFromCloudinary(hero.backgroundVideo, "video");

        // 2. Set new values (Video takes priority if both are uploaded)
        if (newVideo) {
          hero.backgroundVideo = newVideo;
          hero.backgroundImage = null;
          hero.mediaType = "video";
        } else {
          hero.backgroundImage = newImage;
          hero.backgroundVideo = null;
          hero.mediaType = "image";
        }
      }

      if (isActive === "true" || isActive === true) {
        await Hero.updateMany({ _id: { $ne: hero._id } }, { isActive: false });
        hero.isActive = true;
      }

      hero.heading    = heading    ?? hero.heading;
      hero.subheading = subheading ?? hero.subheading;
      hero.ctaText    = ctaText    ?? hero.ctaText;
      hero.ctaLink    = ctaLink    ?? hero.ctaLink;

      await hero.save();
      res.json({ success: true, data: hero });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// DELETE /api/hero/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const hero = await Hero.findByIdAndDelete(req.params.id);
    if (!hero)
      return res.status(404).json({ success: false, message: "Hero not found" });

    // Clean up any files associated with this record from Cloudinary
    if (hero.backgroundImage) await deleteFromCloudinary(hero.backgroundImage, "image");
    if (hero.backgroundVideo) await deleteFromCloudinary(hero.backgroundVideo, "video");

    res.json({ success: true, message: "Hero deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;