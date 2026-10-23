const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

// Ensure local uploads/chat folder exists for local uploads / fallbacks
const localUploadDir = path.join(__dirname, "..", "uploads", "chat");
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

// Check if Cloudinary is configured
const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Multer memory storage when using Cloudinary stream, or disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, localUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const uniqueName = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, uniqueName);
  },
});

const getFileType = (mimetype, originalname) => {
  const ext = (path.extname(originalname) || "").toLowerCase();

  if (
    mimetype.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(ext)
  ) {
    return "voice";
  }
  if (mimetype.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) {
    return "image";
  }
  if (mimetype.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(ext)) {
    return "video";
  }
  return "document";
};

const fileFilter = (req, file, cb) => {
  // Allow all standard media & doc files for WhatsApp-style chat
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
  },
});

/**
 * Upload a local file to Cloudinary (if configured) or return static URL
 */
const uploadToCloudinaryOrLocal = async (file, req) => {
  const fileType = req.body?.isVoice === "true" || req.query?.isVoice === "true"
    ? "voice"
    : getFileType(file.mimetype, file.originalname);

  if (hasCloudinary) {
    try {
      const resourceType =
        fileType === "image"
          ? "image"
          : fileType === "video" || fileType === "voice" || fileType === "audio"
          ? "video"
          : "raw";

      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: "gym-backend/chat",
        resource_type: resourceType,
        public_id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });

      // Remove local temp file after upload to Cloudinary
      try {
        fs.unlinkSync(file.path);
      } catch (e) {}

      return {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        fileType,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      };
    } catch (err) {
      console.warn("Cloudinary upload failed, falling back to local storage:", err.message);
    }
  }

  // Local fallback URL
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:8000";
  const localUrl = `${protocol}://${host}/uploads/chat/${file.filename}`;

  return {
    url: localUrl,
    publicId: file.filename,
    fileType,
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
};

module.exports = {
  chatUpload: upload,
  uploadToCloudinaryOrLocal,
  getFileType,
};
