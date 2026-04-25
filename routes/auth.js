// const router = require("express").Router();
// const About = require("../models/About");
// const { protect } = require("../middleware/auth");
// const {
//   createUploader,
//   deleteFromCloudinary,
//   cloudinary,
// } = require("../config/upload");

// const upload = createUploader("about");

// // ─── PUBLIC ───────────────────────────────────────────────────────────────────

// router.get("/", async (req, res) => {
//   try {
//     const about = await About.findOne({ isActive: true }).sort({
//       updatedAt: -1,
//     });
//     res.json({ success: true, data: about });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // ─── SIGN UPLOAD ──────────────────────────────────────────────────────────────
// // GET /api/about/sign-upload
// router.get("/sign-upload", protect, (req, res) => {
//   try {
//     const timestamp = Math.round(Date.now() / 1000);
//     const folder = "gym-backend/about";
//     const signature = cloudinary.utils.api_sign_request(
//       { timestamp, folder },
//       process.env.CLOUDINARY_API_SECRET,
//     );
//     res.json({
//       success: true,
//       signature,
//       timestamp,
//       folder,
//       cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//       api_key: process.env.CLOUDINARY_API_KEY,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // ─── PROTECTED ────────────────────────────────────────────────────────────────

// router.get("/all", protect, async (req, res) => {
//   try {
//     const items = await About.find().sort({ updatedAt: -1 });
//     res.json({ success: true, data: items });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // POST /api/about
// // Accepts EITHER multipart file (multer) OR imageUrl string in body
// router.post("/", protect, upload.single("image"), async (req, res) => {
//   try {
//     const { title, description, mission, vision, stats, isActive } = req.body;

//     // multer file takes priority; fall back to pre-uploaded Cloudinary URL in body
//     const imageUrl = req.file?.path ?? req.body.imageUrl ?? undefined;

//     let parsedStats = [];
//     if (stats) {
//       try {
//         parsedStats = JSON.parse(stats);
//       } catch {
//         parsedStats = [];
//       }
//     }

//     if (isActive === "true") await About.updateMany({}, { isActive: false });

//     const about = await About.create({
//       title,
//       description,
//       mission,
//       vision,
//       image: imageUrl,
//       stats: parsedStats,
//       isActive: isActive === "true",
//     });
//     res.status(201).json({ success: true, data: about });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // PUT /api/about/:id
// router.put("/:id", protect, upload.single("image"), async (req, res) => {
//   try {
//     const about = await About.findById(req.params.id);
//     if (!about)
//       return res
//         .status(404)
//         .json({ success: false, message: "About not found" });

//     const { title, description, mission, vision, stats, isActive } = req.body;

//     // multer file takes priority; fall back to pre-uploaded Cloudinary URL in body
//     const newImageUrl = req.file?.path ?? req.body.imageUrl ?? null;

//     if (newImageUrl) {
//       if (about.image) await deleteFromCloudinary(about.image);
//       about.image = newImageUrl;
//     }

//     if (isActive === "true") {
//       await About.updateMany({ _id: { $ne: about._id } }, { isActive: false });
//       about.isActive = true;
//     }

//     if (stats) {
//       try {
//         about.stats = JSON.parse(stats);
//       } catch {}
//     }

//     about.title = title ?? about.title;
//     about.description = description ?? about.description;
//     about.mission = mission ?? about.mission;
//     about.vision = vision ?? about.vision;

//     await about.save();
//     res.json({ success: true, data: about });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // DELETE /api/about/:id
// router.delete("/:id", protect, async (req, res) => {
//   try {
//     const about = await About.findByIdAndDelete(req.params.id);
//     if (!about)
//       return res
//         .status(404)
//         .json({ success: false, message: "About not found" });

//     if (about.image) await deleteFromCloudinary(about.image);

//     res.json({ success: true, message: "About deleted" });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// module.exports = router;

const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const Admin = require("../models/Admin");
const { protect } = require("../middleware/auth");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Create first admin (protect this in production – allow only superadmin)
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 chars"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { name, email, password, role } = req.body;
    try {
      const exists = await Admin.findOne({ email });
      if (exists)
        return res
          .status(409)
          .json({ success: false, message: "Email already registered" });

      const admin = await Admin.create({ name, email, password, role });
      res.status(201).json({
        success: true,
        message: "Admin created",
        token: signToken(admin._id),
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { email, password } = req.body;
    try {
      const admin = await Admin.findOne({ email });
      if (!admin || !(await admin.matchPassword(password))) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }
      res.json({
        success: true,
        token: signToken(admin._id),
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", protect, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// ─── PUT /api/auth/change-password ───────────────────────────────────────────
router.put("/change-password", protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const admin = await Admin.findById(req.admin._id);
    if (!(await admin.matchPassword(currentPassword))) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is wrong" });
    }
    admin.password = newPassword;
    await admin.save();
    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
