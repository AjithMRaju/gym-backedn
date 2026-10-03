/**
 * swagger.js – OpenAPI 3.0 specification for the Settings API.
 *
 * Served at GET /api/docs (JSON) when mounted in server.js.
 * You can paste the exported JSON into https://editor.swagger.io to visualize.
 *
 * To serve the interactive UI, install swagger-ui-express:
 *   npm install swagger-ui-express
 * Then in server.js:
 *   const swaggerUi = require('swagger-ui-express');
 *   const swaggerSpec = require('./config/swagger');
 *   app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
 */

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Gym Admin – Settings API",
    version: "1.0.0",
    description:
      "REST API for managing gym profile, billing, notification settings, and security (sessions + 2FA).",
    contact: { name: "Gym Admin Team" },
  },
  servers: [
    { url: "http://localhost:8000", description: "Local development" },
    { url: "https://gym-admin-tawny.vercel.app", description: "Production" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          code: { type: "string", example: "VALIDATION_ERROR" },
          message: { type: "string", example: "Validation failed" },
          fieldErrors: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
            example: { email: ["Invalid email address"] },
          },
        },
      },
      GymSettings: {
        type: "object",
        properties: {
          gym_id: { type: "string", example: "default" },
          name: { type: "string", example: "Iron Paradise Gym" },
          logo_url: { type: "string", nullable: true, example: "https://res.cloudinary.com/..." },
          email: { type: "string", format: "email", example: "admin@ironparadise.com" },
          phone: { type: "string", example: "+91-9876543210" },
          gst_number: { type: "string", nullable: true, example: "27AAPFU0939F1ZV" },
          address: { type: "string", nullable: true, example: "42 MG Road, Mumbai" },
          timezone: { type: "string", example: "Asia/Kolkata" },
          currency: { type: "string", example: "INR" },
          language: { type: "string", example: "en" },
          hours_weekday: {
            type: "object",
            properties: {
              open: { type: "string", example: "06:00" },
              close: { type: "string", example: "22:00" },
            },
          },
          hours_weekend: {
            type: "object",
            properties: {
              open: { type: "string", example: "07:00" },
              close: { type: "string", example: "20:00" },
            },
          },
          updated_at: { type: "string", format: "date-time" },
          updated_by: { type: "string", nullable: true },
          __v: { type: "integer", description: "Optimistic concurrency version. Send this back on PUT to detect conflicts." },
        },
      },
      BillingSettings: {
        type: "object",
        properties: {
          gym_id: { type: "string", example: "default" },
          tax_rate: { type: "number", minimum: 0, maximum: 100, example: 18 },
          grace_period_days: { type: "integer", minimum: 0, maximum: 365, example: 5 },
          late_fee: { type: "number", minimum: 0, example: 100 },
          freeze_limit_days: { type: "integer", minimum: 0, maximum: 365, example: 30 },
          auto_renew: { type: "boolean", example: false },
          allow_guest_passes: { type: "boolean", example: true },
          invoice_prefix: { type: "string", example: "GYM-INV" },
          invoice_footer: { type: "string", example: "Thank you for your business!" },
          updated_at: { type: "string", format: "date-time" },
          __v: { type: "integer" },
        },
      },
      NotificationRule: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          channels: {
            type: "array",
            items: { type: "string", enum: ["email", "sms", "whatsapp", "push"] },
          },
        },
      },
      NotificationSettings: {
        type: "object",
        properties: {
          expiry_reminder: { $ref: "#/components/schemas/NotificationRule" },
          payment_receipt: { $ref: "#/components/schemas/NotificationRule" },
          class_booking: { $ref: "#/components/schemas/NotificationRule" },
          daily_summary: { $ref: "#/components/schemas/NotificationRule" },
        },
      },
      AdminSession: {
        type: "object",
        properties: {
          _id: { type: "string" },
          device: { type: "string", example: "Chrome" },
          ip: { type: "string", example: "192.168.1.1" },
          last_active: { type: "string", format: "date-time" },
          expires_at: { type: "string", format: "date-time" },
          is_current: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/api/settings": {
      get: {
        summary: "Get all settings (combined payload)",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Combined settings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        gym: { $ref: "#/components/schemas/GymSettings" },
                        billing: { $ref: "#/components/schemas/BillingSettings" },
                        notifications: { $ref: "#/components/schemas/NotificationSettings" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/settings/gym": {
      get: {
        summary: "Get gym profile settings",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Gym settings", content: { "application/json": { schema: { properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/GymSettings" } } } } } },
        },
      },
      put: {
        summary: "Update gym profile (Owner only)",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  phone: { type: "string" },
                  gst_number: { type: "string" },
                  address: { type: "string" },
                  timezone: { type: "string", example: "Asia/Kolkata" },
                  currency: { type: "string", example: "INR" },
                  language: { type: "string" },
                  hours_weekday: { $ref: "#/components/schemas/GymSettings/properties/hours_weekday" },
                  hours_weekend: { $ref: "#/components/schemas/GymSettings/properties/hours_weekend" },
                  __v: { type: "integer", description: "Current version for optimistic concurrency" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated gym settings" },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Insufficient permissions" },
          409: { description: "Concurrency conflict – settings were updated by another request" },
        },
      },
    },
    "/api/settings/logo": {
      post: {
        summary: "Upload gym logo (multipart, ≤2 MB, PNG/JPG/SVG)",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: { logo: { type: "string", format: "binary" } },
                required: ["logo"],
              },
            },
          },
        },
        responses: {
          200: { description: "Logo uploaded, URL returned" },
          400: { description: "File too large or wrong type" },
          403: { description: "Insufficient permissions" },
        },
      },
    },
    "/api/settings/billing": {
      get: {
        summary: "Get billing settings",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Billing settings" } },
      },
      put: {
        summary: "Update billing settings (Owner only)",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BillingSettings" } },
          },
        },
        responses: {
          200: { description: "Updated billing settings" },
          400: { description: "Validation error" },
          403: { description: "Insufficient permissions" },
          409: { description: "Concurrency conflict" },
        },
      },
    },
    "/api/settings/notifications": {
      get: {
        summary: "Get notification settings",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notification settings keyed by rule name" } },
      },
      put: {
        summary: "Bulk update notification settings (Owner only)",
        tags: ["Settings"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/NotificationSettings" } },
          },
        },
        responses: {
          200: { description: "Updated notification settings" },
          400: { description: "Validation error" },
          403: { description: "Insufficient permissions" },
        },
      },
    },
    "/api/auth/change-password": {
      post: {
        summary: "Change password (rate-limited; invalidates other sessions)",
        tags: ["Auth - Security"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: {
                  currentPassword: { type: "string" },
                  newPassword: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Password changed; returns new JWT" },
          400: { description: "Validation error" },
          401: { description: "Current password incorrect" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
    "/api/auth/2fa/enable": {
      post: {
        summary: "Generate TOTP secret and QR URI for 2FA setup",
        tags: ["Auth - Security"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Returns base32 secret and otpauth:// URI" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
    "/api/auth/2fa/verify": {
      post: {
        summary: "Verify TOTP token and activate 2FA",
        tags: ["Auth - Security"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: { token: { type: "string", example: "123456" } },
              },
            },
          },
        },
        responses: {
          200: { description: "2FA activated" },
          401: { description: "Invalid TOTP token" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
    "/api/auth/sessions": {
      get: {
        summary: "List active sessions",
        tags: ["Auth - Security"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "List of active sessions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/AdminSession" } },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        summary: "Revoke all other sessions (keep current)",
        tags: ["Auth - Security"],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Other sessions revoked" } },
      },
    },
    "/api/auth/sessions/{id}": {
      delete: {
        summary: "Revoke a specific session",
        tags: ["Auth - Security"],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Session revoked" },
          404: { description: "Session not found" },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
