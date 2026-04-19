const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_IMAGE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;
const MAX_VIDEO_SIZE = (parseInt(process.env.MAX_VIDEO_SIZE_MB) || 100) * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = /jpeg|jpg|png|gif|webp/;
const ALLOWED_VIDEO_TYPES = /mp4|webm|ogg|mov|avi/;
const ALLOWED_VIDEO_MIMES = /video\/(mp4|webm|ogg|quicktime|x-msvideo)/;

/**
 * Create a multer instance scoped to a specific Cloudinary folder.
 * @param {string} folder      - Cloudinary folder name (e.g. 'hero', 'gallery')
 * @param {boolean} allowVideo - whether to also accept video files (default: false)
 */
const createUploader = (folder, allowVideo = false) => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
      const isVideo = ALLOWED_VIDEO_MIMES.test(file.mimetype);
      return {
        folder:         `gym-backend/${folder}`,
        resource_type:  isVideo ? "video" : "image",
        allowed_formats: isVideo
          ? ["mp4", "webm", "ogg", "mov", "avi"]
          : ["jpg", "jpeg", "png", "gif", "webp"],
        // Cloudinary auto-generates a unique public_id, but we prefix with folder name
        public_id: `${folder}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext  = file.originalname.split(".").pop().toLowerCase();
    const mime = file.mimetype;

    const isImage = ALLOWED_IMAGE_TYPES.test(ext) && ALLOWED_IMAGE_TYPES.test(mime);
    const isVideo = allowVideo && ALLOWED_VIDEO_TYPES.test(ext) && ALLOWED_VIDEO_MIMES.test(mime);

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

/**
 * Delete a file from Cloudinary by its URL.
 * Replaces the old fs.unlinkSync() calls in your routes.
 * @param {string} url          - the full Cloudinary URL stored in your DB
 * @param {string} resourceType - 'image' (default) or 'video'
 */
const deleteFromCloudinary = async (url, resourceType = "image") => {
  try {
    // Extract public_id from URL
    // e.g. https://res.cloudinary.com/demo/image/upload/v123/gym-backend/gallery/gallery-abc123
    //  → public_id = "gym-backend/gallery/gallery-abc123"
    const parts    = url.split("/upload/");
    const withVersion = parts[1]; // e.g. "v1234567890/gym-backend/gallery/gallery-abc123.jpg"
    const withoutVersion = withVersion.replace(/^v\d+\//, ""); // remove version prefix
    const publicId = withoutVersion.replace(/\.[^/.]+$/, "");  // remove file extension

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error("Cloudinary delete failed:", err.message);
    // Non-fatal — don't crash the route if delete fails
  }
};

module.exports = { createUploader, deleteFromCloudinary, cloudinary };