# 🏋️ Gym Website – Backend API

A complete **Node.js + Express + MongoDB** backend for a dynamic gym website with full **dashboard (CMS) support**.

---

## 📁 Project Structure

```
gym-backend/
├── server.js                  # App entry point
├── .env.example               # Environment variable template
├── config/
│   └── upload.js              # Multer file-upload config
├── middleware/
│   └── auth.js                # JWT auth middleware
├── models/
│   ├── Admin.js               # Dashboard admin accounts
│   ├── Hero.js                # Hero section content
│   ├── About.js               # About section content
│   ├── Service.js             # Services cards
│   ├── Gallery.js             # Gallery images
│   └── Contact.js             # Contact info + visitor messages
├── routes/
│   ├── auth.js                # Login / register / me
│   ├── hero.js                # Hero CRUD
│   ├── about.js               # About CRUD
│   ├── services.js            # Services CRUD + reorder
│   ├── gallery.js             # Gallery CRUD + bulk upload
│   └── contact.js             # Contact info + messages
├── scripts/
│   └── seed.js                # One-time DB seed
└── uploads/                   # Uploaded images (auto-served)
    ├── hero/
    ├── about/
    ├── services/
    └── gallery/
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

### 3. Seed the database (first run only)
```bash
npm run seed
# Creates admin: admin@gym.com / Admin@123
# Adds sample hero, about, services, and contact info
```

### 4. Start the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs on **http://localhost:5000**

---

## 🔐 Authentication

All **dashboard/admin** routes are protected with JWT Bearer tokens.

**Login to get a token:**
```
POST /api/auth/login
{ "email": "admin@gym.com", "password": "Admin@123" }
```

**Use the token in all protected requests:**
```
Authorization: Bearer <your_token>
```

---

## 📡 API Reference

### Base URL
```
http://localhost:5000/api
```

---

### 🔑 Auth Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Create admin account |
| POST | `/auth/login` | Public | Login and get JWT token |
| GET | `/auth/me` | 🔒 | Get current logged-in admin |
| PUT | `/auth/change-password` | 🔒 | Change admin password |

**POST /auth/login**
```json
Request:
{ "email": "admin@gym.com", "password": "Admin@123" }

Response:
{
  "success": true,
  "token": "eyJhbGciOi...",
  "admin": { "id": "...", "name": "Super Admin", "email": "admin@gym.com", "role": "superadmin" }
}
```

---

### 🦸 Hero Section

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/hero` | Public | Get active hero content |
| GET | `/hero/all` | 🔒 | Get all hero records (dashboard) |
| POST | `/hero` | 🔒 | Create hero section |
| PUT | `/hero/:id` | 🔒 | Update hero section |
| DELETE | `/hero/:id` | 🔒 | Delete hero section |

**POST /hero** (multipart/form-data)
```
heading          (required) – Main headline
subheading       – Supporting text
ctaText          – Button label (default: "Get Started")
ctaLink          – Button href (default: "#contact")
backgroundImage  – Image file (jpg/png/webp, max 5 MB)
isActive         – "true" / "false"
```

**GET /hero Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "heading": "Transform Your Body. Transform Your Life.",
    "subheading": "State-of-the-art equipment...",
    "ctaText": "Start Free Trial",
    "ctaLink": "#contact",
    "backgroundImage": "/uploads/hero/hero-abc123.jpg",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 📖 About Section

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/about` | Public | Get active about content |
| GET | `/about/all` | 🔒 | Get all about records |
| POST | `/about` | 🔒 | Create about section |
| PUT | `/about/:id` | 🔒 | Update about section |
| DELETE | `/about/:id` | 🔒 | Delete about section |

**POST /about** (multipart/form-data)
```
title            (required)
description      (required)
mission
vision
image            – Image file
stats            – JSON string: [{"label":"Members","value":"1200+"}]
isActive         – "true" / "false"
```

---

### 💪 Services

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/services` | Public | Get all active services (sorted) |
| GET | `/services/:id` | Public | Get single service |
| GET | `/services/admin/all` | 🔒 | Get all services including inactive |
| POST | `/services` | 🔒 | Create a service |
| PUT | `/services/:id` | 🔒 | Update a service |
| DELETE | `/services/:id` | 🔒 | Delete a service |
| PUT | `/services/admin/reorder` | 🔒 | Bulk reorder services |

**POST /services** (multipart/form-data)
```
title            (required)
description      (required)
icon             – Icon class name or identifier
image            – Image file
price            – e.g. "₹999/month"
duration         – e.g. "60 min"
order            – Sort order number
isActive         – "true" / "false"
```

**PUT /services/admin/reorder** (JSON)
```json
{
  "items": [
    { "id": "service_id_1", "order": 1 },
    { "id": "service_id_2", "order": 2 }
  ]
}
```

---

### 🖼️ Gallery

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/gallery` | Public | Get active images (supports filters) |
| GET | `/gallery/admin/all` | 🔒 | Get all images including inactive |
| POST | `/gallery` | 🔒 | Upload single image |
| POST | `/gallery/bulk` | 🔒 | Upload multiple images (max 20) |
| PUT | `/gallery/:id` | 🔒 | Update image metadata |
| DELETE | `/gallery/:id` | 🔒 | Delete image |

**GET /gallery** Query Params:
```
category  – Filter: gym | classes | equipment | events | other
limit     – Items per page (default: all)
page      – Page number (default: 1)
```

**POST /gallery** (multipart/form-data)
```
image            (required) – Image file
title
caption
category         – gym | classes | equipment | events | other
order            – Sort order number
isActive         – "true" / "false"
```

**POST /gallery/bulk** (multipart/form-data)
```
images           – Multiple image files (field name: "images", max 20)
category         – Applied to all uploaded images
```

---

### 📞 Contact

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/contact/info` | Public | Get gym contact details |
| POST | `/contact/info` | 🔒 | Create contact info |
| PUT | `/contact/info/:id` | 🔒 | Update contact info |
| POST | `/contact/message` | Public | Submit contact form |
| GET | `/contact/messages` | 🔒 | List all visitor messages |
| PUT | `/contact/messages/:id/read` | 🔒 | Mark message as read |
| DELETE | `/contact/messages/:id` | 🔒 | Delete a message |

**POST /contact/message** (JSON) — visitor form submission
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+91 98765 43210",
  "subject": "Membership Enquiry",
  "message": "I'd like to know about your membership plans."
}
```

**POST /contact/info** (JSON)
```json
{
  "phone": "+91 98765 43210",
  "email": "info@yourgym.com",
  "address": "MG Road, Thrissur, Kerala",
  "workingHours": "Mon–Sat: 5:30 AM – 10:00 PM",
  "mapEmbed": "https://maps.google.com/...",
  "socialLinks": {
    "facebook": "https://facebook.com/yourgym",
    "instagram": "https://instagram.com/yourgym",
    "youtube": "",
    "twitter": ""
  },
  "isActive": true
}
```

**GET /contact/messages** Query Params:
```
unread  – "true" to filter unread only
page    – Page number
limit   – Items per page (default: 20)
```

---

## 🌐 Using the API in Your Frontend (Website)

```javascript
const API = 'http://localhost:5000/api';

// Fetch hero section
const hero = await fetch(`${API}/hero`).then(r => r.json());

// Fetch all active services
const services = await fetch(`${API}/services`).then(r => r.json());

// Fetch gallery (filtered by category, paginated)
const gallery = await fetch(`${API}/gallery?category=gym&limit=12&page=1`).then(r => r.json());

// Fetch about content
const about = await fetch(`${API}/about`).then(r => r.json());

// Fetch contact info
const contact = await fetch(`${API}/contact/info`).then(r => r.json());

// Submit contact form
await fetch(`${API}/contact/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, email, phone, message })
});
```

---

## 🖥️ Using the API in Your Dashboard

```javascript
const API = 'http://localhost:5000/api';
const token = localStorage.getItem('token'); // stored after login
const authHeaders = { Authorization: `Bearer ${token}` };

// ── Login ─────────────────────────────────────────────────────────
const res = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@gym.com', password: 'Admin@123' })
});
const { token } = await res.json();

// ── Upload hero image ──────────────────────────────────────────────
const form = new FormData();
form.append('heading', 'Transform Your Life');
form.append('subheading', 'Join us today');
form.append('ctaText', 'Get Started');
form.append('isActive', 'true');
form.append('backgroundImage', imageFile); // File object

await fetch(`${API}/hero`, {
  method: 'POST',
  headers: authHeaders,
  body: form
});

// ── Add a service ──────────────────────────────────────────────────
const svc = new FormData();
svc.append('title', 'CrossFit');
svc.append('description', 'High intensity functional training');
svc.append('price', '₹1,999/month');
svc.append('image', imageFile);

await fetch(`${API}/services`, {
  method: 'POST',
  headers: authHeaders,
  body: svc
});

// ── Bulk upload gallery images ─────────────────────────────────────
const gallery = new FormData();
gallery.append('category', 'gym');
imageFiles.forEach(f => gallery.append('images', f));

await fetch(`${API}/gallery/bulk`, {
  method: 'POST',
  headers: authHeaders,
  body: gallery
});

// ── Read contact messages ──────────────────────────────────────────
const msgs = await fetch(`${API}/contact/messages?unread=true`, {
  headers: authHeaders
}).then(r => r.json());
```

---

## 🗄️ MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `admins` | Dashboard admin accounts (hashed passwords) |
| `heroes` | Hero section content + background image |
| `abouts` | About section with stats array |
| `services` | Service cards with images and pricing |
| `galleries` | Gallery images with categories and ordering |
| `contactinfos` | Gym's contact details + social links |
| `contactmessages` | Visitor enquiry form submissions |

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `MONGO_URI` | MongoDB connection string | — |
| `JWT_SECRET` | Secret key for signing tokens | — |
| `JWT_EXPIRES_IN` | Token expiry duration | `7d` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `*` |
| `MAX_FILE_SIZE_MB` | Max image upload size | `5` |

---

## 🔒 Security Checklist (Production)

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Set `ALLOWED_ORIGINS` to your actual frontend domain(s)
- [ ] Change default admin password after first login
- [ ] Use MongoDB Atlas with IP whitelist for cloud deployments
- [ ] Enable HTTPS with SSL certificate
- [ ] Consider rate limiting (e.g. `express-rate-limit`)
- [ ] Move uploaded files to cloud storage (AWS S3 / Cloudinary) for scalability

---

## 📦 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB (via Mongoose ODM) |
| Auth | JWT + bcryptjs |
| File Uploads | Multer (disk storage) |
| Validation | express-validator |
| Security | Helmet, CORS |
| Logging | Morgan |
