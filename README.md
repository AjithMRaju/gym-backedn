# 🏋️ Gym Website – Backend API

A complete **Node.js + Express + MongoDB** backend for a dynamic gym website with full **dashboard (CMS) support**.

---

## 📁 Project Structure

```
gym-backend/
├── server.js                  # App entry point
├── .env.example               # Environment variable template
├── config/
│   ├── upload.js              # Multer / Cloudinary upload config
│   └── swagger.js             # OpenAPI 3.0 spec (GET /api/docs)
├── middleware/
│   ├── auth.js                # JWT auth + session revocation check
│   ├── roleGuard.js           # RBAC – requireRole() middleware
│   └── rateLimiter.js         # In-memory sliding-window rate limiter
├── models/
│   ├── Admin.js               # Dashboard admin accounts + 2FA fields
│   ├── GymSettings.js         # Gym profile (one row per tenant)
│   ├── BillingSettings.js     # Billing/invoice settings
│   ├── NotificationSettings.js# Per-channel notification rules
│   ├── AuditLog.js            # Immutable audit trail
│   ├── AdminSession.js        # Active JWT session tracking
│   ├── Hero.js                # Hero section content
│   ├── About.js               # About section content
│   ├── Service.js             # Services cards
│   ├── Gallery.js             # Gallery images
│   └── Contact.js             # Contact info + visitor messages
├── routes/
│   ├── auth.js                # Login / register / me
│   ├── authSettings.js        # Change-password / 2FA / sessions
│   ├── settings.js            # Gym / billing / notification settings
│   ├── hero.js                # Hero CRUD
│   ├── about.js               # About CRUD
│   ├── services.js            # Services CRUD + reorder
│   ├── gallery.js             # Gallery CRUD + bulk upload
│   └── contact.js             # Contact info + messages
├── services/
│   ├── settingsService.js     # Settings business logic (partial update, concurrency)
│   └── audit.js               # Audit log writer
├── utils/
│   ├── validators.js          # isValidTimezone / isValidCurrency / isValidEmail / isValidPhone
│   └── crypto.js              # AES-256-GCM encrypt/decrypt + maskSecret + hashToken
├── scripts/
│   ├── seed.js                # One-time DB seed
│   └── seedSettings.js        # Default gym/billing/notification settings seed
├── tests/
│   ├── validators.unit.test.js
│   ├── crypto.unit.test.js
│   └── settings.integration.test.js
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

| Method | Endpoint | Auth | Rate-limited | Description |
|--------|----------|------|-------------|-------------|
| POST | `/auth/register` | Public | — | Create admin account |
| POST | `/auth/login` | Public | — | Login and get JWT token |
| GET | `/auth/me` | 🔒 | — | Get current logged-in admin |
| POST | `/auth/change-password` | 🔒 | ✅ 5/15 min | Change password (invalidates other sessions) |
| POST | `/auth/2fa/enable` | 🔒 | ✅ 10/15 min | Generate TOTP secret + QR URI |
| POST | `/auth/2fa/verify` | 🔒 | ✅ 10/15 min | Verify TOTP token and activate 2FA |
| GET | `/auth/sessions` | 🔒 | — | List all active sessions |
| DELETE | `/auth/sessions` | 🔒 | — | Revoke all other sessions |
| DELETE | `/auth/sessions/:id` | 🔒 | — | Revoke a specific session |

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

### ⚙️ Settings

> All settings endpoints require a valid JWT token (`Authorization: Bearer <token>`).
> **Mutating endpoints** (`PUT`, `POST /logo`) additionally require the `superadmin` role — editors receive `403 FORBIDDEN`.

#### Endpoint Overview

| Method | Endpoint | Role Required | Description |
|--------|----------|--------------|-------------|
| GET | `/settings` | Any auth | Combined payload (gym + billing + notifications) |
| GET | `/settings/gym` | Any auth | Gym profile settings |
| PUT | `/settings/gym` | superadmin | Update gym profile (partial update supported) |
| POST | `/settings/logo` | superadmin | Upload gym logo (≤2 MB, PNG/JPG/SVG) |
| GET | `/settings/billing` | Any auth | Billing & invoice settings |
| PUT | `/settings/billing` | superadmin | Update billing settings |
| GET | `/settings/notifications` | Any auth | Notification rules (keyed by rule name) |
| PUT | `/settings/notifications` | superadmin | Bulk-update notification rules |

---

#### GET /settings — Combined payload (first-page load)

```json
Response:
{
  "success": true,
  "data": {
    "gym": { /* GymSettings object */ },
    "billing": { /* BillingSettings object */ },
    "notifications": {
      "expiry_reminder": { "enabled": true, "channels": ["email", "sms"] },
      "payment_receipt": { "enabled": true, "channels": ["email"] },
      "class_booking":   { "enabled": true, "channels": ["email", "push"] },
      "daily_summary":   { "enabled": false, "channels": ["email"] }
    }
  }
}
```

---

#### GET /settings/gym

```json
Response:
{
  "success": true,
  "data": {
    "gym_id": "default",
    "name": "Iron Paradise Gym",
    "logo_url": "https://res.cloudinary.com/.../logo.png",
    "email": "admin@ironparadise.com",
    "phone": "+91-9876543210",
    "gst_number": "27AAPFU0939F1ZV",
    "address": "42 MG Road, Mumbai",
    "timezone": "Asia/Kolkata",
    "currency": "INR",
    "language": "en",
    "hours_weekday": { "open": "06:00", "close": "22:00" },
    "hours_weekend": { "open": "07:00", "close": "20:00" },
    "updated_at": "2026-10-03T06:00:00.000Z",
    "updated_by": "66f1a2b3c4d5e6f7a8b9c0d1",
    "__v": 3
  }
}
```

> **`__v`** is the optimistic concurrency version. Always echo it back in PUT requests.

---

#### PUT /settings/gym — Update gym profile

```json
Request body (all fields optional — partial update):
{
  "name": "Iron Paradise Gym",
  "email": "admin@ironparadise.com",
  "phone": "+91-9876543210",
  "gst_number": "27AAPFU0939F1ZV",
  "address": "42 MG Road, Mumbai",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "language": "en",
  "hours_weekday": { "open": "06:00", "close": "22:00" },
  "hours_weekend": { "open": "07:00", "close": "20:00" },
  "__v": 3
}
```

**Validation rules:**
```
name        – max 100 chars
email       – valid email format
phone       – 7–20 chars, allows + - ( ) spaces
timezone    – valid IANA timezone (e.g. Asia/Kolkata, UTC, America/New_York)
currency    – valid ISO 4217 code (e.g. INR, USD, EUR)
language    – 2–10 char language tag
hours_*.open / .close  – HH:MM format
__v         – send current version to detect conflicts (optional but recommended)
```

```json
Success response (200):
{
  "success": true,
  "data": { /* updated GymSettings object */ }
}

Conflict response (409) – when __v is stale:
{
  "code": "CONFLICT",
  "message": "Settings were modified by another request. Please reload and try again.",
  "fieldErrors": {}
}

Validation error response (400):
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "fieldErrors": {
    "email": ["Invalid email address"],
    "timezone": ["NotAZone is not a valid IANA timezone"]
  }
}

Forbidden (403) – editor role:
{
  "code": "FORBIDDEN",
  "message": "This action requires one of the following roles: superadmin",
  "fieldErrors": {}
}
```

---

#### POST /settings/logo — Upload gym logo

```
Content-Type: multipart/form-data
Field name:   logo
Max size:     2 MB
Allowed MIME: image/png, image/jpeg, image/svg+xml
Allowed ext:  .png, .jpg, .jpeg, .svg
```

```json
Success response (200):
{
  "success": true,
  "data": {
    "logo_url": "https://res.cloudinary.com/your-cloud/image/upload/v.../logo-1727...",
    "gym": { /* full updated GymSettings object */ }
  }
}

Error (400) – wrong type or too large:
{
  "code": "UPLOAD_ERROR",
  "message": "Logo must be a PNG, JPG, or SVG file under 2 MB",
  "fieldErrors": {}
}
```

---

#### GET /settings/billing

```json
Response:
{
  "success": true,
  "data": {
    "gym_id": "default",
    "tax_rate": 18,
    "grace_period_days": 5,
    "late_fee": 100,
    "freeze_limit_days": 30,
    "auto_renew": false,
    "allow_guest_passes": true,
    "invoice_prefix": "GYM-INV",
    "invoice_footer": "Thank you for choosing Iron Paradise Gym!",
    "updated_at": "2026-10-03T06:00:00.000Z",
    "__v": 1
  }
}
```

---

#### PUT /settings/billing — Update billing settings

```json
Request body (all fields optional):
{
  "tax_rate": 18,
  "grace_period_days": 5,
  "late_fee": 100,
  "freeze_limit_days": 30,
  "auto_renew": false,
  "allow_guest_passes": true,
  "invoice_prefix": "GYM-INV",
  "invoice_footer": "Thank you for your business!",
  "__v": 1
}
```

**Validation rules:**
```
tax_rate          – number, 0–100
grace_period_days – integer, 0–365
late_fee          – number, >= 0
freeze_limit_days – integer, 0–365
auto_renew        – boolean
allow_guest_passes– boolean
invoice_prefix    – string, max 20 chars
invoice_footer    – string, max 1000 chars
```

```json
Success response (200):
{
  "success": true,
  "data": { /* updated BillingSettings object */ }
}
```

---

#### GET /settings/notifications

```json
Response:
{
  "success": true,
  "data": {
    "expiry_reminder": {
      "enabled": true,
      "channels": ["email", "sms"]
    },
    "payment_receipt": {
      "enabled": true,
      "channels": ["email"]
    },
    "class_booking": {
      "enabled": true,
      "channels": ["email", "push"]
    },
    "daily_summary": {
      "enabled": false,
      "channels": ["email"]
    }
  }
}
```

---

#### PUT /settings/notifications — Bulk-update notification rules

Send only the keys you want to update. Omitted keys are left unchanged.

```json
Request body:
{
  "expiry_reminder": { "enabled": true, "channels": ["email", "sms", "whatsapp"] },
  "daily_summary":   { "enabled": false }
}
```

**Valid keys:** `expiry_reminder` · `payment_receipt` · `class_booking` · `daily_summary`  
**Valid channels:** `email` · `sms` · `whatsapp` · `push`

```json
Success response (200):
{
  "success": true,
  "data": { /* full updated notifications keyed object */ }
}

Validation error (400) – unknown key:
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "fieldErrors": {
    "_": ["Unknown notification key: telegram_alerts. Must be one of: expiry_reminder, ..."]
  }
}
```

---

### 🔐 Auth – Security Endpoints

#### POST /auth/change-password

Rate-limited to **5 requests per 15 minutes** per IP. On success, all other active sessions are revoked and a fresh JWT is returned.

```json
Request:
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecure456!"
}

Success response (200):
{
  "success": true,
  "message": "Password updated. Other sessions have been revoked.",
  "token": "eyJhbGciOi..."  // new JWT for current session
}

Error (401) – wrong current password:
{
  "code": "INVALID_CREDENTIALS",
  "message": "Current password is incorrect",
  "fieldErrors": { "currentPassword": ["Current password is incorrect"] }
}

Error (429) – rate limit exceeded:
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many password-change attempts. Please try again in 15 minutes.",
  "fieldErrors": {}
}
```

---

#### POST /auth/2fa/enable

Rate-limited to **10 requests per 15 minutes** per IP.

```json
Response (200):
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauth_uri": "otpauth://totp/GymAdmin:admin%40gym.com?secret=JBSWY3DPEHPK3PXP&issuer=GymAdmin&algorithm=SHA1&digits=6&period=30"
  }
}
```

> Encode `otpauth_uri` as a QR code in the frontend (e.g. with `qrcode.js`). The user scans it with Google Authenticator / Authy.

---

#### POST /auth/2fa/verify

```json
Request:
{ "token": "123456" }

Success (200):
{ "success": true, "message": "Two-factor authentication has been enabled." }

Error (401) – wrong or expired TOTP:
{
  "code": "INVALID_TOKEN",
  "message": "TOTP token is incorrect or expired",
  "fieldErrors": { "token": ["Invalid or expired TOTP token"] }
}
```

---

#### GET /auth/sessions — List active sessions

```json
Response (200):
{
  "success": true,
  "data": [
    {
      "_id": "66f1a2b3c4d5e6f7a8b9c0d1",
      "device": "Chrome",
      "ip": "103.27.8.141",
      "last_active": "2026-10-03T06:00:00.000Z",
      "expires_at": "2026-10-10T06:00:00.000Z",
      "created_at": "2026-10-03T05:00:00.000Z",
      "is_current": true
    },
    {
      "_id": "66f1a2b3c4d5e6f7a8b9c0d2",
      "device": "Mobile Browser",
      "ip": "103.27.8.99",
      "last_active": "2026-10-02T18:00:00.000Z",
      "expires_at": "2026-10-09T18:00:00.000Z",
      "created_at": "2026-10-02T18:00:00.000Z",
      "is_current": false
    }
  ]
}
```

---

#### DELETE /auth/sessions/:id — Revoke a specific session

```json
Success (200):
{ "success": true, "message": "Session revoked." }

Not found (404):
{ "code": "NOT_FOUND", "message": "Session not found", "fieldErrors": {} }
```

#### DELETE /auth/sessions — Revoke all other sessions (keep current)

```json
Success (200):
{ "success": true, "message": "2 other session(s) have been revoked." }
```

---

### 🚨 Consistent Error Format

All `4xx` and `5xx` responses follow this structure:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Human-readable description",
  "fieldErrors": {
    "fieldName": ["error message 1", "error message 2"]
  }
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | One or more fields failed validation |
| `UPLOAD_ERROR` | 400 | File upload rejected (wrong type / too large) |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `TOKEN_INVALID` | 401 | Token expired or malformed |
| `SESSION_REVOKED` | 401 | Session was explicitly revoked |
| `INVALID_CREDENTIALS` | 401 | Wrong password |
| `INVALID_TOKEN` | 401 | Wrong TOTP code |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Optimistic concurrency version mismatch |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

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
| `admins` | Dashboard admin accounts (hashed passwords + 2FA secrets) |
| `gymsettings` | Gym profile – name, logo, email, phone, timezone, currency |
| `billingsettings` | Tax rate, grace period, late fee, invoice config |
| `notificationsettings` | Per-channel notification rules (email/sms/whatsapp/push) |
| `auditlogs` | Immutable change history – who, what, old value, new value |
| `adminsessions` | Active JWT sessions (SHA-256 hashed); TTL auto-cleanup |
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
| `MAX_VIDEO_SIZE_MB` | Max video upload size | `100` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | — |
| `CLOUDINARY_API_KEY` | Cloudinary API key | — |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | — |
| `SETTINGS_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM secrets at rest. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | — |
| `APP_NAME` | Application name shown in 2FA QR codes | `GymAdmin` |
| `MONGO_URI_TEST` | Separate DB for integration tests | — |

---

## 🔒 Security Checklist (Production)

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Set `ALLOWED_ORIGINS` to your actual frontend domain(s)
- [ ] Change default admin password after first login
- [ ] Generate a fresh `SETTINGS_ENCRYPTION_KEY` (64-char hex) per environment
- [ ] Use MongoDB Atlas with IP whitelist for cloud deployments
- [ ] Enable HTTPS with SSL certificate
- [ ] Rate limiting is built-in for password & 2FA endpoints (5–10 req / 15 min)
- [ ] Enable 2FA (`/auth/2fa/enable` → `/auth/2fa/verify`) for all admin accounts
- [ ] Review audit logs (`auditlogs` collection) regularly
- [ ] Uploaded files are stored on Cloudinary – no local disk dependency

---

## 🧪 Running Tests

```bash
# Unit tests only (no database needed) – validators & crypto helpers
npm run test:unit

# Integration tests (requires running MongoDB)
npm run test:integration

# All tests
npm test
```

**Test coverage:**
| Suite | Tests | What's covered |
|---|---|---|
| `validators.unit.test.js` | 27 | timezone, currency, email, phone validation + error payload builder |
| `crypto.unit.test.js` | 15 | AES-256-GCM round-trip, IV randomness, tamper detection, maskSecret, hashToken |
| `settings.integration.test.js` | 24 | All 8 settings endpoints – auth, RBAC, validation, concurrency, partial update |

---

## 📋 Seeding Default Settings

```bash
# Seed initial gym/billing/notification defaults (safe to run multiple times)
npm run seed:settings
```

Creates:
- Gym: `My Gym` · timezone `Asia/Kolkata` · currency `INR`
- Billing: 18% tax, 5-day grace period, 30-day freeze limit
- Notifications: expiry_reminder & payment_receipt enabled via email

---

## 📦 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB (via Mongoose ODM) |
| Auth | JWT + bcryptjs (12 rounds) |
| 2FA | RFC 6238 TOTP (built-in, zero deps) |
| File Uploads | Multer + Cloudinary |
| Validation | express-validator + custom validators |
| Encryption | AES-256-GCM (Node.js crypto, built-in) |
| Security | Helmet, CORS, rate limiter, RBAC |
| Logging | Morgan + audit log (MongoDB) |
| API Docs | OpenAPI 3.0 (`GET /api/docs`) |
| Testing | Jest + Supertest |
