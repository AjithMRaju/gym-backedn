const router = require('express').Router();
const About = require('../models/About');
const { protect } = require('../middleware/auth');
const { createUploader, deleteFromCloudinary } = require('../config/upload');

const upload = createUploader('about');

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const about = await About.findOne({ isActive: true }).sort({ updatedAt: -1 });
    res.json({ success: true, data: about });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED ────────────────────────────────────────────────────────────────

router.get('/all', protect, async (req, res) => {
  try {
    const items = await About.find().sort({ updatedAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    const { title, description, mission, vision, stats, isActive } = req.body;
    const imageUrl = req.file ? req.file.path : undefined; // Cloudinary URL

    let parsedStats = [];
    if (stats) {
      try { parsedStats = JSON.parse(stats); } catch { parsedStats = []; }
    }

    if (isActive === 'true') await About.updateMany({}, { isActive: false });

    const about = await About.create({
      title, description, mission, vision,
      image: imageUrl,
      stats: parsedStats,
      isActive: isActive === 'true',
    });
    res.status(201).json({ success: true, data: about });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', protect, upload.single('image'), async (req, res) => {
  try {
    const about = await About.findById(req.params.id);
    if (!about) return res.status(404).json({ success: false, message: 'About not found' });

    const { title, description, mission, vision, stats, isActive } = req.body;

    if (req.file) {
      if (about.image) await deleteFromCloudinary(about.image); // delete old from Cloudinary
      about.image = req.file.path; // Cloudinary URL
    }

    if (isActive === 'true') {
      await About.updateMany({ _id: { $ne: about._id } }, { isActive: false });
      about.isActive = true;
    }

    if (stats) {
      try { about.stats = JSON.parse(stats); } catch { }
    }

    about.title       = title       ?? about.title;
    about.description = description ?? about.description;
    about.mission     = mission     ?? about.mission;
    about.vision      = vision      ?? about.vision;

    await about.save();
    res.json({ success: true, data: about });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const about = await About.findByIdAndDelete(req.params.id);
    if (!about) return res.status(404).json({ success: false, message: 'About not found' });

    if (about.image) await deleteFromCloudinary(about.image); // delete from Cloudinary

    res.json({ success: true, message: 'About deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;