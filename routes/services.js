const router = require("express").Router();
const Service = require("../models/Service");
const { protect } = require("../middleware/auth");
const {
  createUploader,
  deleteFromCloudinary,
  cloudinary,
} = require("../config/upload");

const upload = createUploader("services");

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({
      order: 1,
      createdAt: 1,
    });
    res.json({ success: true, count: services.length, data: services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service)
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SIGN UPLOAD ──────────────────────────────────────────────────────────────
// GET /api/services/sign-upload
router.get("/sign-upload", protect, (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "gym-backend/services";
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
    const services = await Service.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, count: services.length, data: services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/services
// Accepts EITHER multipart file (multer) OR imageUrl string in body
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { title, description, icon, price, duration, order, isActive } =
      req.body;

    // multer file takes priority; fall back to pre-uploaded Cloudinary URL in body
    const imageUrl = req.file?.path ?? req.body.imageUrl ?? undefined;

    const service = await Service.create({
      title,
      description,
      icon,
      price,
      duration,
      image: imageUrl,
      order: order ? Number(order) : 0,
      isActive: isActive !== "false",
    });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/services/:id
router.put("/:id", protect, upload.single("image"), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service)
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });

    const { title, description, icon, price, duration, order, isActive } =
      req.body;

    // multer file takes priority; fall back to pre-uploaded Cloudinary URL in body
    const newImageUrl = req.file?.path ?? req.body.imageUrl ?? null;

    if (newImageUrl) {
      if (service.image) await deleteFromCloudinary(service.image);
      service.image = newImageUrl;
    }

    service.title = title ?? service.title;
    service.description = description ?? service.description;
    service.icon = icon ?? service.icon;
    service.price = price ?? service.price;
    service.duration = duration ?? service.duration;
    service.order = order != null ? Number(order) : service.order;
    if (isActive !== undefined)
      service.isActive = isActive !== "false" && isActive !== false;

    await service.save();
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/services/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service)
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });

    if (service.image) await deleteFromCloudinary(service.image);

    res.json({ success: true, message: "Service deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/services/admin/reorder
router.put("/admin/reorder", protect, async (req, res) => {
  try {
    const { items } = req.body;
    const ops = items.map(({ id, order }) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order } } },
    }));
    await Service.bulkWrite(ops);
    res.json({ success: true, message: "Services reordered" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
