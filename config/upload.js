const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const MAX_IMAGE_SIZE =
  (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024; // 5MB default
const MAX_VIDEO_SIZE =
  (parseInt(process.env.MAX_VIDEO_SIZE_MB) || 100) * 1024 * 1024; // 100MB default

const ALLOWED_IMAGE_TYPES = /jpeg|jpg|png|gif|webp/;
const ALLOWED_VIDEO_TYPES = /mp4|webm|ogg|mov|avi/;
const ALLOWED_VIDEO_MIMES = /video\/(mp4|webm|ogg|quicktime|x-msvideo)/;

const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

/**
 * Create a multer instance scoped to a specific upload folder.
 * @param {string} folder      - subfolder inside /uploads  (e.g. 'hero', 'gallery')
 * @param {boolean} allowVideo - whether to also accept video files (default: false)
 */
const createUploader = (folder, allowVideo = false) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, "../uploads", folder));
    },
    filename: (req, file, cb) => {
      const unique = crypto.randomBytes(10).toString("hex");
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${folder}-${unique}${ext}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    const mime = file.mimetype;

    const isImage =
      ALLOWED_IMAGE_TYPES.test(ext) && ALLOWED_IMAGE_TYPES.test(mime);
    const isVideo =
      allowVideo &&
      ALLOWED_VIDEO_TYPES.test(ext) &&
      ALLOWED_VIDEO_MIMES.test(mime);

    if (isImage || isVideo) {
      cb(null, true);
    } else {
      const allowed = allowVideo
        ? "image (jpg, jpeg, png, gif, webp) or video (mp4, webm, ogg, mov, avi)"
        : "image (jpg, jpeg, png, gif, webp)";
      cb(new Error(`Only ${allowed} files are allowed`));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: allowVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE },
  });
};

module.exports = { createUploader };
