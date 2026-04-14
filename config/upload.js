const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_TYPES = /jpeg|jpg|png|gif|webp/;
const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

/**
 * Create a multer instance scoped to a specific upload folder.
 * @param {string} folder  - subfolder inside /uploads  (e.g. 'hero', 'gallery')
 */
const createUploader = (folder) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../uploads', folder));
    },
    filename: (req, file, cb) => {
      const unique = crypto.randomBytes(10).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${folder}-${unique}${ext}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype;
    if (ALLOWED_TYPES.test(ext) && ALLOWED_TYPES.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'));
    }
  };

  return multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });
};

module.exports = { createUploader };
