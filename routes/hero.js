const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const Hero = require('../models/Hero');
const { protect } = require('../middleware/auth');
const { createUploader } = require('../config/upload');

const upload = createUploader('hero');

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

// GET /api/hero  →  active hero content for the website
router.get('/', async (req, res) => {
  try {
    const hero = await Hero.findOne({ isActive: true }).sort({ updatedAt: -1 });
    res.json({ success: true, data: hero });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED (dashboard) ────────────────────────────────────────────────────

// GET /api/hero/all  →  all hero records (for dashboard list)
router.get('/all', protect, async (req, res) => {
  try {
    const heroes = await Hero.find().sort({ updatedAt: -1 });
    res.json({ success: true, data: heroes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/hero  →  create new hero section
router.post('/', protect, upload.single('backgroundImage'), async (req, res) => {
  try {
    const { heading, subheading, ctaText, ctaLink, isActive } = req.body;
    const imageUrl = req.file ? `/uploads/hero/${req.file.filename}` : undefined;

    // If setting active, deactivate others
    if (isActive === 'true' || isActive === true) {
      await Hero.updateMany({}, { isActive: false });
    }

    const hero = await Hero.create({
      heading, subheading, ctaText, ctaLink,
      backgroundImage: imageUrl,
      isActive: isActive === 'true' || isActive === true,
    });
    res.status(201).json({ success: true, data: hero });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/hero/:id  →  update hero section
router.put('/:id', protect, upload.single('backgroundImage'), async (req, res) => {
  try {
    const hero = await Hero.findById(req.params.id);
    if (!hero) return res.status(404).json({ success: false, message: 'Hero not found' });

    const { heading, subheading, ctaText, ctaLink, isActive } = req.body;

    if (req.file) {
      // Remove old image
      if (hero.backgroundImage) {
        const old = path.join(__dirname, '..', hero.backgroundImage);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      hero.backgroundImage = `/uploads/hero/${req.file.filename}`;
    }

    if (isActive === 'true' || isActive === true) {
      await Hero.updateMany({ _id: { $ne: hero._id } }, { isActive: false });
      hero.isActive = true;
    } else if (isActive === 'false' || isActive === false) {
      hero.isActive = false;
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
});

// DELETE /api/hero/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const hero = await Hero.findByIdAndDelete(req.params.id);
    if (!hero) return res.status(404).json({ success: false, message: 'Hero not found' });

    if (hero.backgroundImage) {
      const p = path.join(__dirname, '..', hero.backgroundImage);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    res.json({ success: true, message: 'Hero deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
