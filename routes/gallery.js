



const router = require('express').Router();
const Gallery = require('../models/Gallery');
const { protect } = require('../middleware/auth');
const { createUploader, deleteFromCloudinary } = require('../config/upload'); // ← updated import

const upload = createUploader('gallery');

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;

    const limit = parseInt(req.query.limit) || 0;
    const page  = parseInt(req.query.page)  || 1;
    const skip  = (page - 1) * limit;

    const [images, total] = await Promise.all([
      Gallery.find(filter).sort({ order: 1, createdAt: -1 }).skip(skip).limit(limit),
      Gallery.countDocuments(filter),
    ]);

    res.json({ success: true, total, page, pages: limit ? Math.ceil(total / limit) : 1, data: images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED ────────────────────────────────────────────────────────────────

router.get('/admin/all', protect, async (req, res) => {
  try {
    const images = await Gallery.find().sort({ order: 1, createdAt: -1 });
    res.json({ success: true, count: images.length, data: images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image file required' });

    const { title, caption, category, order, isActive } = req.body;

    const item = await Gallery.create({
      title, caption, category,
      imageUrl: req.file.path, // ← Cloudinary returns the full URL in req.file.path
      order: order ? Number(order) : 0,
      isActive: isActive !== 'false',
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bulk', protect, upload.array('images', 20), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No images uploaded' });

    const { category } = req.body;
    const docs = req.files.map((f, i) => ({
      imageUrl: f.path, // ← Cloudinary URL
      category: category || 'gym',
      order: i,
    }));

    const items = await Gallery.insertMany(docs);
    res.status(201).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', protect, upload.single('image'), async (req, res) => {
  try {
    const item = await Gallery.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Gallery item not found' });

    const { title, caption, category, order, isActive } = req.body;

    if (req.file) {
      if (item.imageUrl) await deleteFromCloudinary(item.imageUrl); // ← replaces fs.unlinkSync
      item.imageUrl = req.file.path;
    }

    item.title    = title    ?? item.title;
    item.caption  = caption  ?? item.caption;
    item.category = category ?? item.category;
    item.order    = order != null ? Number(order) : item.order;
    if (isActive !== undefined) item.isActive = isActive !== 'false' && isActive !== false;

    await item.save();
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const item = await Gallery.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Gallery item not found' });

    if (item.imageUrl) await deleteFromCloudinary(item.imageUrl); // ← replaces fs.unlinkSync

    res.json({ success: true, message: 'Gallery item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;