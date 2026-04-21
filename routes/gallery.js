const router = require("express").Router();
const Gallery = require("../models/Gallery");
const { protect } = require("../middleware/auth");
const {
  createUploader,
  deleteFromCloudinary,
  cloudinary,
} = require("../config/upload");

const upload = createUploader("gallery");

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;

    const limit = parseInt(req.query.limit) || 0;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const [images, total] = await Promise.all([
      Gallery.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Gallery.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: limit ? Math.ceil(total / limit) : 1,
      data: images,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SIGN UPLOAD ──────────────────────────────────────────────────────────────
// GET /api/gallery/sign-upload
router.get("/sign-upload", protect, (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "gym-backend/gallery";
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET,
    );
    res.json({
      success: true,
      signature,
      timestamp,
      folder,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED ────────────────────────────────────────────────────────────────

router.get("/admin/all", protect, async (req, res) => {
  try {
    const images = await Gallery.find().sort({ order: 1, createdAt: -1 });
    res.json({ success: true, count: images.length, data: images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/gallery  →  single image
// Accepts EITHER multipart file (multer) OR imageUrl string in body
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    // multer file takes priority; fall back to pre-uploaded Cloudinary URL in body
    const imageUrl = req.file?.path ?? req.body.imageUrl ?? null;
    if (!imageUrl)
      return res
        .status(400)
        .json({ success: false, message: "Image file required" });

    const { title, caption, category, order, isActive } = req.body;

    const item = await Gallery.create({
      title,
      caption,
      category,
      imageUrl,
      order: order ? Number(order) : 0,
      isActive: isActive !== "false",
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/gallery/bulk  →  multiple images
// Accepts EITHER multipart files (multer) OR imageUrls array in body
router.post("/bulk", protect, upload.array("images", 20), async (req, res) => {
  try {
    let docs;

    if (req.files?.length) {
      // Standard multer upload
      const { category } = req.body;
      docs = req.files.map((f, i) => ({
        imageUrl: f.path,
        category: category || "gym",
        order: i,
      }));
    } else if (req.body.imageUrls) {
      // Pre-uploaded Cloudinary URLs sent as JSON array
      const urls = Array.isArray(req.body.imageUrls)
        ? req.body.imageUrls
        : JSON.parse(req.body.imageUrls);
      if (!urls.length)
        return res
          .status(400)
          .json({ success: false, message: "No images uploaded" });
      const { category } = req.body;
      docs = urls.map((url, i) => ({
        imageUrl: url,
        category: category || "gym",
        order: i,
      }));
    } else {
      return res
        .status(400)
        .json({ success: false, message: "No images uploaded" });
    }

    const items = await Gallery.insertMany(docs);
    res.status(201).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/gallery/:id
router.put("/:id", protect, upload.single("image"), async (req, res) => {
  try {
    const item = await Gallery.findById(req.params.id);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Gallery item not found" });

    const { title, caption, category, order, isActive } = req.body;

    // multer file takes priority; fall back to pre-uploaded Cloudinary URL in body
    const newImageUrl = req.file?.path ?? req.body.imageUrl ?? null;

    if (newImageUrl) {
      if (item.imageUrl) await deleteFromCloudinary(item.imageUrl);
      item.imageUrl = newImageUrl;
    }

    item.title = title ?? item.title;
    item.caption = caption ?? item.caption;
    item.category = category ?? item.category;
    item.order = order != null ? Number(order) : item.order;
    if (isActive !== undefined)
      item.isActive = isActive !== "false" && isActive !== false;

    await item.save();
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/gallery/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const item = await Gallery.findByIdAndDelete(req.params.id);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Gallery item not found" });

    if (item.imageUrl) await deleteFromCloudinary(item.imageUrl);

    res.json({ success: true, message: "Gallery item deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
