const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { ContactInfo, ContactMessage } = require('../models/Contact');
const { protect } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
//  CONTACT INFO  (gym's own details shown on the website)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/contact/info  →  public
router.get('/info', async (req, res) => {
  try {
    const info = await ContactInfo.findOne({ isActive: true }).sort({ updatedAt: -1 });
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/contact/info  →  create (protected)
router.post('/info', protect, async (req, res) => {
  try {
    const info = await ContactInfo.create(req.body);
    res.status(201).json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/contact/info/:id  →  update (protected)
router.put('/info/:id', protect, async (req, res) => {
  try {
    const info = await ContactInfo.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!info) return res.status(404).json({ success: false, message: 'Contact info not found' });
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CONTACT MESSAGES  (submitted by visitors)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/contact/message  →  public  (visitor submits form)
router.post(
  '/message',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('message').notEmpty().withMessage('Message is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const msg = await ContactMessage.create(req.body);
      res.status(201).json({ success: true, message: 'Message sent successfully', data: msg });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/contact/messages  →  all messages (protected, dashboard)
router.get('/messages', protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.unread === 'true') filter.isRead = false;

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ContactMessage.countDocuments(filter),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/contact/messages/:id/read  →  mark as read (protected)
router.put('/messages/:id/read', protect, async (req, res) => {
  try {
    const msg = await ContactMessage.findByIdAndUpdate(
      req.params.id, { isRead: true }, { new: true }
    );
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, data: msg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/contact/messages/:id  →  delete message (protected)
router.delete('/messages/:id', protect, async (req, res) => {
  try {
    const msg = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
