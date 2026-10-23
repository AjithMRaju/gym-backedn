/**
 * sttService.js - Speech-To-Text Provider Abstraction
 */

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "video/mp4", // some webm/mp4 recordings report as video/mp4
]);

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Transcribes audio buffer using the configured provider.
 *
 * @param {Buffer} audioBuffer - In-memory raw audio
 * @param {string} mimeType - e.g. "audio/webm", "audio/wav", "audio/mp4"
 * @param {object} options - { language: string, filename?: string }
 * @returns {Promise<string>} Cleaned transcript
 */
async function transcribeAudio(audioBuffer, mimeType, options = {}) {
  if (!audioBuffer || audioBuffer.length === 0) {
    const err = new Error("Audio buffer is empty");
    err.statusCode = 422;
    err.code = "NO_SPEECH_DETECTED";
    throw err;
  }

  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    const err = new Error("Audio file size exceeds the 25 MB limit");
    err.statusCode = 413;
    err.code = "FILE_TOO_LARGE";
    throw err;
  }

  // Normalize mime type
  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    const err = new Error(
      `Unsupported audio format '${mimeType}'. Supported formats are audio/webm, audio/mp4, and audio/wav.`
    );
    err.statusCode = 400;
    err.code = "INVALID_AUDIO_FORMAT";
    throw err;
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.STT_API_KEY;
  const isMock = !apiKey || apiKey.startsWith("test") || apiKey === "mock_key";

  if (isMock) {
    return mockTranscribe(audioBuffer, options);
  }

  // Call OpenAI Whisper API
  const ext = normalizedMime.includes("wav") ? "wav" : normalizedMime.includes("webm") ? "webm" : "mp4";
  const filename = options.filename || `audio.${ext}`;

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: normalizedMime });
  formData.append("file", blob, filename);
  formData.append("model", process.env.STT_MODEL || "whisper-1");
  if (options.language) {
    formData.append("language", options.language.slice(0, 2).toLowerCase());
  }

  let attempt = 0;
  while (attempt < 2) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        if (attempt >= 2) {
          const err = new Error(`STT service returned ${res.status}: ${errorText}`);
          err.statusCode = 502;
          err.code = "STT_FAILED";
          throw err;
        }
        continue;
      }

      const data = await res.json();
      const transcript = (data.text || "").trim();

      if (!transcript) {
        const err = new Error("No speech detected in audio");
        err.statusCode = 422;
        err.code = "NO_SPEECH_DETECTED";
        throw err;
      }

      return transcript;
    } catch (err) {
      if (err.statusCode) throw err;
      if (attempt >= 2) {
        const upstreamErr = new Error(`STT request failed: ${err.message}`);
        upstreamErr.statusCode = 502;
        upstreamErr.code = "STT_FAILED";
        throw upstreamErr;
      }
    }
  }
}

/**
 * Mock transcription for tests / offline mode.
 */
function mockTranscribe(audioBuffer, options = {}) {
  // If buffer has string hint embedded (e.g. from tests) or silent
  const str = audioBuffer.toString("utf8");
  if (str.includes("SILENT_AUDIO") || str.length < 10) {
    const err = new Error("No speech detected in audio");
    err.statusCode = 422;
    err.code = "NO_SPEECH_DETECTED";
    throw err;
  }

  if (str.includes("TRANSCRIPT_HINT:")) {
    const hint = str.split("TRANSCRIPT_HINT:")[1].trim();
    if (!hint) {
      const err = new Error("No speech detected in audio");
      err.statusCode = 422;
      err.code = "NO_SPEECH_DETECTED";
      throw err;
    }
    return hint;
  }

  // Default test transcript
  return "How much is the total revenue this week?";
}

module.exports = {
  transcribeAudio,
  ALLOWED_MIME_TYPES,
  MAX_AUDIO_SIZE,
};
