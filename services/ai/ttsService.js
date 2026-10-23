/**
 * ttsService.js - Text-To-Speech Provider Abstraction
 */

const crypto = require("crypto");
const AssistantAudio = require("../../models/AssistantAudio");

const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);

/**
 * Strips markdown syntax and caps text length for audio synthesis.
 */
function sanitizeTextForSpeech(text) {
  if (!text) return "";
  const cleaned = text
    .replace(/[*#`_~[\]()<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 600);
}

/**
 * Generates speech audio MP3 for the given text.
 *
 * @param {string} text - Spoken text reply
 * @param {string} userVoice - Voice preference (e.g. "alloy", "default")
 * @param {object} context - { userId: ObjectId }
 * @returns {Promise<{ audioUrl: string|null, expiresAt: string|null, ttsAvailable: boolean }>}
 */
async function generateSpeech(text, userVoice = "default", context = {}) {
  const cleanText = sanitizeTextForSpeech(text);
  if (!cleanText) {
    return { audioUrl: null, expiresAt: null, ttsAvailable: false };
  }

  const voice = ALLOWED_VOICES.has(userVoice?.toLowerCase())
    ? userVoice.toLowerCase()
    : "alloy";

  const apiKey = process.env.OPENAI_API_KEY || process.env.TTS_API_KEY;
  const isMock = !apiKey || apiKey.startsWith("test") || apiKey === "mock_key";

  let audioBuffer;

  if (isMock) {
    // Generate mock MP3 buffer for testing / offline
    audioBuffer = Buffer.from(`MOCK_MP3_AUDIO_FOR:${cleanText}`);
  } else {
    // Call OpenAI TTS API
    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const res = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.TTS_MODEL || "tts-1",
            input: cleanText,
            voice,
            response_format: "mp3",
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          if (attempt >= 2) {
            console.error(`[TTS Error] Upstream returned status ${res.status}`);
            return { audioUrl: null, expiresAt: null, ttsAvailable: false };
          }
          continue;
        }

        const arrayBuffer = await res.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
        break;
      } catch (err) {
        if (attempt >= 2) {
          console.error(`[TTS Error] Speech generation failed: ${err.message}`);
          return { audioUrl: null, expiresAt: null, ttsAvailable: false };
        }
      }
    }
  }

  if (!audioBuffer) {
    return { audioUrl: null, expiresAt: null, ttsAvailable: false };
  }

  try {
    // Store temporarily with 10-minute TTL
    const storageKey = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const audioDoc = await AssistantAudio.create({
      userId: context.userId,
      storageKey,
      mimeType: "audio/mpeg",
      data: audioBuffer,
      expiresAt,
    });

    const audioUrl = `/api/v1/ai/assistant/audio/${audioDoc._id}`;
    return {
      audioUrl,
      expiresAt: expiresAt.toISOString(),
      ttsAvailable: true,
    };
  } catch (dbErr) {
    console.error("[TTS Error] Failed saving audio to database:", dbErr.message);
    return { audioUrl: null, expiresAt: null, ttsAvailable: false };
  }
}

module.exports = {
  generateSpeech,
  sanitizeTextForSpeech,
  ALLOWED_VOICES,
};
