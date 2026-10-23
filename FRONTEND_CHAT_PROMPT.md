# 🤖 Frontend Implementation Prompt: Real-Time WhatsApp-Standard Chat & In-App Toast System

> **Instructions for the Frontend Developer / AI Assistant:**
> Use this prompt and technical specification to implement a full-featured, WhatsApp-grade real-time chat interface connecting **Admins** and **Active Trainers** in the gym frontend web application (e.g. Next.js / React with TailwindCSS).

---

## 🎯 Goal & Key Requirements

1. **WhatsApp Experience**:
   - Left sidebar with conversations & active trainers directory.
   - Message bubbles with sender/receiver alignment, timestamps, and **WhatsApp ticks**:
     - `sent` (✓ Single grey tick)
     - `delivered` (✓✓ Double grey tick)
     - `read` (✓✓ Double blue tick)
   - **Quoted Reply**: Swipe or click "Reply" to attach a quoted message preview above the input bar.
   - **Edit Message**: Inline editing for sent messages with an "(edited)" badge.
   - **Delete Message**: Modal offering **"Delete for everyone"** (renders *"🚫 This message was deleted"*) and **"Delete for me"**.
   - **Voice Messages**: Browser `MediaRecorder` audio recording with duration timer, waveform/scrubber, play/pause, and 1x/1.5x/2x playback speeds.
   - **File Attachments**: Upload images, videos, and documents with instant preview.
   - **WhatsApp Pagination**: Cursor-based upward infinite scroll (`?before=<oldestMessageId>&limit=30`) that retains scroll position without jumping.
   - **Typing & Recording Indicators**: Real-time *"typing..."* and *"recording audio..."* in the conversation header.
   - **Online Presence**: Real-time *"Online"* / *"Last seen at..."* indicator.

2. **Active Trainers Enforcement**:
   - Admins can **only** start or participate in chats with **active trainers** (`status === 'active'`).
   - If a trainer is `inactive` or `on_leave`, display an informative banner (*"This trainer is currently inactive. Messaging is disabled."*) and disable the message input bar.

3. **In-App Toast Notification (Non-Push)**:
   - When any message arrives while the user is outside that conversation or anywhere in the dashboard, trigger an **instant in-app toast notification** (using `sonner` or `react-hot-toast`).
   - Toast displays: Sender Avatar, Sender Name, Message Preview / Audio / Attachment badge, and a timestamp.
   - Clicking the toast immediately opens that conversation and marks messages as read!

---

## 🌐 Backend API & WebSocket Contracts

- **Base REST URL**: `http://localhost:5000/api/chat` (or `process.env.NEXT_PUBLIC_API_URL + '/api/chat'`)
- **WebSocket URL**: `http://localhost:5000` (Socket.io)
- **Auth**: Pass JWT in header `Authorization: Bearer <token>` for REST, and in socket options: `{ auth: { token: "<JWT_TOKEN>" } }`.

### Key REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/chat/auth/me` | Current user profile & role (`Admin` or `Trainer`) |
| `GET` | `/api/chat/trainers/active?search=` | Active trainers directory with unread counts & status |
| `GET` | `/api/chat/conversations` | List user's conversations with `unreadCount` & `lastMessage` |
| `POST` | `/api/chat/conversations` | Get or create conversation with `{ trainerId }` (Admin) or `{ adminId }` (Trainer) |
| `GET` | `/api/chat/conversations/:id/messages?before=&limit=30` | Cursor-paginated message history (oldest to newest) |
| `POST` | `/api/chat/conversations/:id/messages` | Fallback REST send `{ text, messageType, attachments, replyToMessageId }` |
| `PUT` | `/api/chat/messages/:id` | Edit message `{ text }` |
| `DELETE` | `/api/chat/messages/:id?deleteType=everyone\|for_me` | Delete message |
| `PATCH` | `/api/chat/conversations/:id/read` | Mark all messages in conversation as read (turns ticks blue) |
| `POST` | `/api/chat/upload` | Upload file/voice (multipart `file`, optional `duration`, optional `isVoice=true`) |
| `GET` | `/api/chat/notifications?unreadOnly=true` | Fetch unread chat toasts |
| `PATCH` | `/api/chat/notifications/:id/read` | Dismiss/mark notification toast as read |
| `GET` | `/api/chat/unread-summary` | Total unread badge count |

### WebSocket Events (Socket.io)

```typescript
// 1. Client Emits
socket.emit("join_conversation", { conversationId });
socket.emit("leave_conversation", { conversationId });
socket.emit("send_message", {
  conversationId,
  text: "Hello!",
  messageType: "text" | "voice" | "image" | "video" | "document",
  attachments: [{ url, fileName, fileSize, mimeType, duration, fileType }],
  replyToMessageId: "...",
});
socket.emit("edit_message", { messageId, newText });
socket.emit("delete_message", { messageId, deleteType: "everyone" | "for_me" });
socket.emit("mark_read", { conversationId });
socket.emit("typing_start", { conversationId });
socket.emit("typing_stop", { conversationId });
socket.emit("record_voice_start", { conversationId });
socket.emit("record_voice_stop", { conversationId });

// 2. Client Listens
socket.on("new_message", (message: ChatMessage) => { ... });
socket.on("chat:notification", (toastData: ChatToastPayload) => {
  // Trigger in-app toast notification!
});
socket.on("message_edited", ({ messageId, conversationId, newText, isEdited, editedAt }) => { ... });
socket.on("message_deleted", ({ messageId, conversationId, deletedForEveryone, text }) => { ... });
socket.on("messages_read", ({ conversationId, readerId, readAt }) => { ... });
socket.on("user_typing", ({ conversationId, userId, userName, isTyping }) => { ... });
socket.on("user_recording", ({ conversationId, userId, userName, isRecording }) => { ... });
socket.on("user_status", ({ userId, userType, isOnline, lastSeen }) => { ... });
socket.on("conversation_updated", ({ conversationId, lastMessage, preview }) => { ... });
```

---

## 💻 Recommended Implementation Structure

```
components/chat/
├── ChatLayout.tsx              # Split pane layout (Sidebar + Main Chat Area)
├── ChatSidebar.tsx             # Conversations list + Active trainers search + unread badges
├── ChatHeader.tsx              # Partner avatar, name, online status, typing/recording status
├── MessageList.tsx             # Infinite scroll message feed with date separators
├── MessageBubble.tsx           # WhatsApp bubble (Text, Voice player, Media preview, Reply quote, Ticks)
├── QuotedReplyPreview.tsx      # Quoted replay banner above input bar
├── ChatInputBar.tsx            # Text input, emoji button, attachment trigger, voice recorder button
├── VoiceRecorderModal.tsx      # Audio recording UI with live timer and visualizer
├── MediaLightbox.tsx           # Full-screen image/video lightbox
├── InactiveTrainerBanner.tsx   # Warning banner when trainer is inactive
└── hooks/
    ├── useChatSocket.ts        # Socket connection & global event listener
    ├── useVoiceRecorder.ts     # Web Audio API & MediaRecorder handler
    └── useChatScroll.ts        # Preserves scroll position on loading older messages
```

---

## 🛠️ Complete Code Reference

### 1. Socket Hook with Real-Time Toast Notification (`useChatSocket.ts`)

```typescript
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner"; // or react-hot-toast

export interface ChatToastPayload {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  preview: string;
  messageType: string;
  conversationId: string;
  messageId: string;
  sender: {
    id: string;
    name: string;
    role: string;
    photo?: string;
  };
  createdAt: string;
}

export function useChatSocket(
  token: string | null,
  activeConversationId?: string,
  onNewMessage?: (msg: any) => void,
  onMessageEdited?: (data: any) => void,
  onMessageDeleted?: (data: any) => void,
  onMessagesRead?: (data: any) => void
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🟢 Connected to Chat WebSocket:", socket.id);
      if (activeConversationId) {
        socket.emit("join_conversation", { conversationId: activeConversationId });
      }
    });

    // ─── Real-Time In-App Toast Notification ───────────────────────
    socket.on("chat:notification", (notif: ChatToastPayload) => {
      // Don't show toast if user is currently inside that conversation
      if (activeConversationId === notif.conversationId) return;

      toast.custom((t) => (
        <div
          onClick={() => {
            // Navigate to conversation
            window.location.href = `/admin/chat?conversationId=${notif.conversationId}`;
            toast.dismiss(t);
          }}
          className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-700 text-white rounded-xl shadow-2xl cursor-pointer hover:border-emerald-500 transition-all max-w-sm"
        >
          {notif.sender.photo ? (
            <img src={notif.sender.photo} alt={notif.sender.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold">
              {notif.sender.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{notif.sender.name}</p>
            <p className="text-xs text-gray-300 truncate">{notif.preview}</p>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">Just now</span>
        </div>
      ), { duration: 5000 });
    });

    // New message in current room
    socket.on("new_message", (msg) => {
      if (onNewMessage) onNewMessage(msg);
    });

    socket.on("message_edited", (data) => {
      if (onMessageEdited) onMessageEdited(data);
    });

    socket.on("message_deleted", (data) => {
      if (onMessageDeleted) onMessageDeleted(data);
    });

    socket.on("messages_read", (data) => {
      if (onMessagesRead) onMessagesRead(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, activeConversationId]);

  return socketRef;
}
```

---

### 2. WhatsApp Voice Recorder Hook (`useVoiceRecorder.ts`)

```typescript
import { useState, useRef } from "react";

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied or not available");
    }
  };

  const stopRecording = (): Promise<{ audioBlob: Blob; duration: number }> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) return;

      if (timerRef.current) clearInterval(timerRef.current);

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setIsRecording(false);
        resolve({ audioBlob, duration: recordingDuration });
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    });
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setRecordingDuration(0);
  };

  return { isRecording, recordingDuration, startRecording, stopRecording, cancelRecording };
}
```

---

### 3. WhatsApp Status Ticks Component (`WhatsAppTick.tsx`)

```tsx
import React from "react";

export function WhatsAppTick({ status }: { status: "sent" | "delivered" | "read" }) {
  if (status === "read") {
    // Double Blue Ticks
    return (
      <span className="inline-flex text-[#53bdeb]" title="Read">
        <svg className="w-4 h-4 fill-current" viewBox="0 0 16 15">
          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
        </svg>
      </span>
    );
  }

  if (status === "delivered") {
    // Double Grey Ticks
    return (
      <span className="inline-flex text-gray-400" title="Delivered">
        <svg className="w-4 h-4 fill-current" viewBox="0 0 16 15">
          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
        </svg>
      </span>
    );
  }

  // Single Grey Tick (Sent)
  return (
    <span className="inline-flex text-gray-400" title="Sent">
      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 15">
        <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
      </svg>
    </span>
  );
}
```

---

### 4. Uploading Voice Notes & Attachments

```typescript
export async function uploadChatAttachment(
  file: File | Blob,
  token: string,
  fileName: string = "file",
  duration?: number,
  isVoice: boolean = false
) {
  const formData = new FormData();
  formData.append("file", file, fileName);
  if (duration) formData.append("duration", duration.toString());
  if (isVoice) formData.append("isVoice", "true");

  const res = await fetch("http://localhost:5000/api/chat/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data; // { url, publicId, fileType, fileName, fileSize, mimeType, duration }
}
```

---

### 5. Inactive Trainer Guard Banner Component

```tsx
export function InactiveTrainerBanner({ status }: { status?: string }) {
  if (status === "active" || !status) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs text-amber-300 flex items-center justify-center gap-2">
      <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
      <span>
        This trainer is currently <strong>{status}</strong>. Sending and receiving messages is paused until their status is set to active.
      </span>
    </div>
  );
}
```

---

## 🎨 UI Aesthetic & Style Recommendations

- **Dark Theme Palette**:
  - Background: `#0c1317` (WhatsApp Dark background)
  - Sidebar: `#111b21`
  - Partner bubble: `#202c33`
  - My sent bubble: `#005c4b` (WhatsApp emerald bubble)
  - Text: `#e9edef` (Primary), `#8696a0` (Muted/Time)
  - Accent / CTA: `#00a884` (WhatsApp Green)
- **Sound Effect (Optional)**:
  - Play subtle `pop.mp3` audio when receiving new messages while page is active.

---

## ✅ Implementation Checklist

- [ ] Connect to Socket.io on application boot using the stored admin/trainer JWT.
- [ ] Render active trainers list in sidebar fetched from `GET /api/chat/trainers/active`.
- [ ] Connect `socket.on("chat:notification")` to toast popup.
- [ ] Implement message stream with WhatsApp bubbles, ticks, timestamp, and quoted replies.
- [ ] Implement voice recording using `MediaRecorder` and duration counter.
- [ ] Implement message editing (inline input) & deletion modal (everyone / for me).
- [ ] Implement upward cursor pagination (`before=<id>`).
- [ ] Disable chat input and show warning banner when trainer status is `inactive` or `on_leave`.
