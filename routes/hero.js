const router = require("express").Router();
const Hero = require("../models/Hero");
const { protect } = require("../middleware/auth");
const {
  createUploader,
  deleteFromCloudinary,
  cloudinary,
} = require("../config/upload");

const upload = createUploader("hero", true);

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const hero = await Hero.findOne({ isActive: true }).sort({ updatedAt: -1 });
    res.json({ success: true, data: hero });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/all", protect, async (req, res) => {
  try {
    const heroes = await Hero.find().sort({ updatedAt: -1 });
    res.json({ success: true, data: heroes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SIGN UPLOAD ──────────────────────────────────────────────────────────────
// GET /api/hero/sign-upload
// Frontend calls this, gets a signature, then uploads the file directly to
// Cloudinary — bypassing Vercel's 4.5 MB body limit for large videos.
router.get("/sign-upload", protect, (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "gym-backend/hero";
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET,
    );
    res.json({
      success: true,
      signature,
      timestamp,
      folder,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "MISSING_CLOUD_NAME",
      api_key: process.env.CLOUDINARY_API_KEY || "MISSING_API_KEY",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED ────────────────────────────────────────────────────────────────

// POST /api/hero
// Accepts EITHER:
//   a) multipart file via multer  (images / small files)
//   b) backgroundImage / backgroundVideo as plain URL strings in JSON body
//      (used after a direct Cloudinary upload from the frontend)
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

      let imageUrl =
        req.files?.["backgroundImage"]?.[0]?.path ??
        req.body.backgroundImage ??
        undefined;
      let videoUrl =
        req.files?.["backgroundVideo"]?.[0]?.path ??
        req.body.backgroundVideo ??
        undefined;

      // Mutual exclusivity — video wins
      if (videoUrl && imageUrl) {
        if (req.files?.["backgroundImage"]?.[0]?.path)
          await deleteFromCloudinary(imageUrl, "image");
        imageUrl = undefined;
      }

      if (isActive === "true" || isActive === true)
        await Hero.updateMany({}, { isActive: false });

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
        return res
          .status(404)
          .json({ success: false, message: "Hero not found" });

      const { heading, subheading, ctaText, ctaLink, isActive } = req.body;

      const newImage =
        req.files?.["backgroundImage"]?.[0]?.path ??
        req.body.backgroundImage ??
        null;
      const newVideo =
        req.files?.["backgroundVideo"]?.[0]?.path ??
        req.body.backgroundVideo ??
        null;

      if (newImage || newVideo) {
        if (hero.backgroundImage)
          await deleteFromCloudinary(hero.backgroundImage, "image");
        if (hero.backgroundVideo)
          await deleteFromCloudinary(hero.backgroundVideo, "video");

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

      hero.heading = heading ?? hero.heading;
      hero.subheading = subheading ?? hero.subheading;
      hero.ctaText = ctaText ?? hero.ctaText;
      hero.ctaLink = ctaLink ?? hero.ctaLink;

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
      return res
        .status(404)
        .json({ success: false, message: "Hero not found" });

    if (hero.backgroundImage)
      await deleteFromCloudinary(hero.backgroundImage, "image");
    if (hero.backgroundVideo)
      await deleteFromCloudinary(hero.backgroundVideo, "video");

    res.json({ success: true, message: "Hero deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
