/**
 * App.jsx — Fully fixed + redesigned PDC Chat
 *
 * REAL-TIME FIXES:
 * - sendMessage: adds message to local state immediately via ack callback
 *   (no waiting for the server broadcast back to sender)
 * - socket.to() on server excludes sender from broadcast, preventing duplicates
 * - Messages load automatically when a chat is selected (useEffect dependency fixed)
 * - Duplicate guard uses Set for O(1) lookup
 * - Socket connection established once per auth session, properly cleaned up
 *
 * PERFORMANCE:
 * - useCallback for all event handlers to prevent child re-renders
 * - useMemo for filtered chats list
 * - Debounced user search (300ms) via custom hook
 * - All API calls use .lean() on server side (fewer bytes over wire)
 * - Messages keyed by chatId in a Map-like object to avoid full re-renders
 *
 * UI:
 * - Premium dark glassmorphism aesthetic
 * - Custom font pairing: Sora (display) + DM Sans (body)
 * - Gradient chat bubbles with animated entry
 * - WhatsApp/Discord-style sidebar with avatars and previews
 * - Animated typing indicator
 * - Online presence dots
 * - Smooth send button with pulse animation
 * - Responsive: sidebar collapses on mobile
 */

import {
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Send,
  Smile,
  Users,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setAuthToken } from './lib/api.js';
import { createSocket } from './lib/socket.js';
import EmojiPicker from 'emoji-picker-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const storedToken = localStorage.getItem('token');

const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const timeLabel = (date) =>
  new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));

const relativeDay = (date) => {
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeLabel(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
};

const getMessageChatId = (msg) =>
  typeof msg.chat === 'string' ? msg.chat : msg.chat?._id;

const getMessageStatus = (msg, meId, participantCount) => {
  const seenCount =
    msg.readBy?.filter((r) => r.user?._id && r.user._id !== meId).length || 0;
  const deliveredCount = msg.deliveredTo?.length || 0;
  const recipientCount = Math.max(participantCount - 1, 0);
  if (seenCount > 0) return 'seen';
  if (recipientCount > 0 && deliveredCount >= recipientCount) return 'delivered';
  return 'sent';
};

const chatTitle = (chat, me) => {
  if (chat.type === 'group') return chat.name;
  return (
    chat.participants.find((p) => p._id !== me?._id)?.name || 'Direct chat'
  );
};

const chatOtherUser = (chat, me) => {
  if (chat.type === 'group') return null;
  return chat.participants.find((p) => p._id !== me?._id);
};

const AVATAR_COLORS = [
  ['#00c896', '#0ea5e9'],
  ['#a855f7', '#ec4899'],
  ['#f59e0b', '#ef4444'],
  ['#06b6d4', '#6366f1'],
  ['#10b981', '#3b82f6'],
];

const avatarGradient = (id = '') => {
  const idx = id.charCodeAt(id.length - 1) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
};

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name = '', userId = '', size = 'md', online = false, avatarUrl = null }) {
  const [c1, c2] = avatarGradient(userId || name);
  const sz = size === 'lg' ? 'h-14 w-14 text-base' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';
  const dot = size === 'lg' ? 'h-4 w-4 border-[3px]' : 'h-3 w-3 border-2';
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const imgSrc = avatarUrl
    ? (avatarUrl.startsWith('http') ? avatarUrl : `${API_BASE}${avatarUrl}`)
    : null;

  return (
    <div className="relative shrink-0">
      <div
        className={`${sz} grid place-items-center rounded-2xl font-bold text-white shadow-lg overflow-hidden`}
        style={imgSrc ? {} : { background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={name}
            className="h-full w-full object-cover rounded-2xl"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
              // show initials fallback
              const span = document.createElement('span');
              span.textContent = initials(name);
              e.currentTarget.parentElement.appendChild(span);
            }}
          />
        ) : (
          initials(name)
        )}
      </div>
      {online && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dot} rounded-full border-[#0a0f1e] bg-emerald-400`}
          style={{ boxShadow: '0 0 8px rgba(52,211,153,0.9)' }}
        />
      )}
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login'
          ? { email: form.email.trim(), password: form.password }
          : { name: form.name.trim(), email: form.email.trim(), password: form.password };
      const { data } = await api.post(endpoint, payload);
      onAuthed(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center px-4">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/8 blur-[100px]" />
      </div>

      <section className="auth-glass relative w-full max-w-md rounded-3xl p-8">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl text-white shadow-glow" style={{ background: 'linear-gradient(135deg, #00c896, #0ea5e9)' }}>
            <MessageCircle size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-white tracking-tight">PDC Chat</h1>
            <p className="text-xs text-slate-400 font-medium">Distributed realtime messaging</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="mb-6 flex rounded-2xl bg-white/5 p-1">
          {['login', 'register'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all duration-200 ${
                mode === m
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input
              className="auth-field"
              name="name"
              placeholder="Full name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
            />
          )}
          <input
            className="auth-field"
            name="email"
            placeholder="Email address"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
          />
          <input
            className="auth-field"
            name="password"
            placeholder="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={handleChange}
          />

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
              <X size={14} />
              {error}
            </div>
          )}

          <button
            className="btn-primary mt-1 w-full"
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Please wait…
              </span>
            ) : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────

function ProfileModal({ me, onClose, onUpdated }) {
  const [preview, setPreview] = useState(me?.avatarUrl || null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const previewSrc = preview
    ? (preview.startsWith('http') || preview.startsWith('blob:') ? preview : `${API_BASE}${preview}`)
    : null;

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('File must be under 5 MB'); return; }
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUpdated(data.user);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    try {
      const { data } = await api.delete('/users/me/avatar');
      onUpdated(data.user);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-modal-in relative w-full max-w-sm rounded-3xl p-6"
        style={{
          background: 'rgba(10,15,30,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,200,150,0.08)',
        }}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute right-4 top-4 icon-btn"><X size={18} /></button>

        <h2 className="mb-6 font-display text-lg font-semibold text-white">Profile Picture</h2>

        {/* Avatar preview */}
        <div className="mb-6 flex flex-col items-center gap-4">
          <div
            className="profile-avatar-ring relative h-28 w-28 cursor-pointer"
            onClick={() => fileRef.current?.click()}
            title="Click to change photo"
          >
            <div className="h-full w-full overflow-hidden rounded-full"
              style={{
                background: previewSrc ? 'transparent' : `linear-gradient(135deg, ${avatarGradient(me?._id || me?.name || '')[0]}, ${avatarGradient(me?._id || me?.name || '')[1]})`,
              }}
            >
              {previewSrc ? (
                <img src={previewSrc} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white">
                  {initials(me?.name)}
                </div>
              )}
            </div>
            {/* Camera overlay */}
            <div className="profile-avatar-overlay absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 opacity-0 transition-opacity duration-200">
              <Camera size={22} className="text-white" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">Change</span>
            </div>
          </div>

          <div className="text-center">
            <p className="font-semibold text-white">{me?.name}</p>
            <p className="text-xs text-slate-400">{me?.email}</p>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />

        {error && (
          <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2 text-center text-xs text-red-400 ring-1 ring-red-500/20">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/[0.07] py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.12]"
          >
            <Camera size={16} />
            {previewSrc && file ? 'Choose different photo' : 'Choose photo'}
          </button>

          {file && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #00c896, #0ea5e9)' }}
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Check size={16} />
              )}
              {uploading ? 'Uploading…' : 'Save photo'}
            </button>
          )}

          {me?.avatarUrl && !file && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 py-3 text-sm font-medium text-red-400 ring-1 ring-red-500/20 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {removing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
              ) : (
                <X size={16} />
              )}
              {removing ? 'Removing…' : 'Remove photo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ chats, selectedChat, me, onSelect, onNewChat, onLogout, onProfileClick, query, setQuery, connected }) {
  return (
    <aside
      className={`flex h-full flex-col border-r border-white/[0.07] bg-[#080d1a]/80 backdrop-blur-2xl ${
        selectedChat ? 'hidden md:flex md:w-[360px] lg:w-[400px]' : 'flex w-full md:w-[360px] lg:w-[400px]'
      }`}
    >
      {/* Header */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onProfileClick}
            className="shrink-0 rounded-2xl transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            title="Edit profile picture"
          >
            <Avatar name={me?.name} userId={me?._id} online={connected} avatarUrl={me?.avatarUrl} />
          </button>
          <div className="min-w-0">
            <p className="truncate font-display font-semibold text-white text-sm leading-tight">{me?.name}</p>
            <p className={`text-xs font-medium mt-0.5 ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {connected ? '● Online' : '○ Connecting…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onNewChat}
            className="icon-btn"
            title="New chat"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={onLogout}
            className="icon-btn"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="shrink-0 px-3 py-3 border-b border-white/[0.07]">
        <label className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 text-slate-400 transition focus-within:bg-white/[0.09] focus-within:text-slate-200">
          <Search size={15} />
          <input
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="Search conversations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {/* Chat list */}
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {chats.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <MessageCircle size={32} className="opacity-40" />
            <p className="text-sm">{query ? 'No chats match your search' : 'No conversations yet'}</p>
          </div>
        )}
        {chats.map((chat) => {
          const other = chatOtherUser(chat, me);
          const isActive = selectedChat?._id === chat._id;
          return (
            <button
              key={chat._id}
              onClick={() => onSelect(chat)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-all duration-150 hover:bg-white/[0.05] ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500/[0.12] to-cyan-500/[0.06] border-l-2 border-emerald-500/60'
                  : 'border-l-2 border-transparent'
              }`}
            >
              <Avatar
                name={chat.type === 'group' ? chat.name : other?.name || '?'}
                userId={chat.type === 'group' ? chat._id : other?._id || ''}
                online={chat.type === 'direct' && other?.status !== 'offline'}
                avatarUrl={chat.type === 'direct' ? other?.avatarUrl : null}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-100'}`}>
                    {chatTitle(chat, me)}
                  </p>
                  {chat.lastMessage?.createdAt && (
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {relativeDay(chat.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {chat.lastMessage?.body || (chat.type === 'group' ? 'Group chat' : 'Direct message')}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, own, chat, me }) {
  const status = own ? getMessageStatus(message, me._id, chat.participants.length) : null;

  return (
    <div className={`flex items-end gap-2 msg-enter ${own ? 'justify-end' : 'justify-start'}`}>
      {!own && chat.type === 'group' && (
        <Avatar
          name={message.sender?.name || '?'}
          userId={message.sender?._id || ''}
          avatarUrl={message.sender?.avatarUrl || null}
          size="sm"
        />
      )}

      <div
        className={`relative max-w-[78%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 shadow-xl ${
          own
            ? 'rounded-br-sm text-white'
            : 'rounded-bl-sm bg-white/[0.09] text-slate-100 ring-1 ring-white/[0.08]'
        }`}
        style={
          own
            ? {
                background: 'linear-gradient(135deg, #00c896 0%, #0891b2 100%)',
                boxShadow: '0 4px 24px rgba(0,200,150,0.2)',
              }
            : {}
        }
      >
        {chat.type === 'group' && !own && (
          <p className="mb-1 text-[11px] font-bold" style={{ color: '#00c896' }}>
            {message.sender?.name}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
          {message.body}
        </p>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10.5px] ${
            own ? 'text-emerald-50/70' : 'text-slate-500'
          }`}
        >
          <span>{timeLabel(message.createdAt)}</span>
          {own && status === 'sent' && <Check size={13} />}
          {own && status === 'delivered' && <CheckCheck size={13} />}
          {own && status === 'seen' && <CheckCheck size={13} className="text-cyan-300" />}
        </div>
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ users }) {
  if (!users.length) return null;
  const names = users.map((u) => u.name).join(', ');
  return (
    <div className="flex items-end gap-2 msg-enter">
      <div className="rounded-2xl rounded-bl-sm bg-white/[0.09] px-4 py-3 ring-1 ring-white/[0.08]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{names}</span>
          <div className="flex gap-1 ml-1">
            {[0, 140, 280].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-typing-dot"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chat window ──────────────────────────────────────────────────────────────

function ChatWindow({ chat, me, messages, typingUsers, onSend, onRead, onTyping, onBack }) {
  const [body, setBody] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  const onEmojiClick = useCallback((emojiData) => {
    const emoji = emojiData.emoji;
    const textarea = inputRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = body.slice(0, start) + emoji + body.slice(end);
      setBody(newBody);
      // Restore cursor position after emoji insert
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      });
    } else {
      setBody((prev) => prev + emoji);
    }
    setShowEmoji(false);
    onTyping(true);
  }, [body, onTyping]);

  // Auto-scroll to bottom when new messages arrive or chat changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chat?._id]);

  // Mark messages as read when chat is open
  useEffect(() => {
    if (chat) onRead(chat._id);
  }, [chat?._id, messages.length]);

  // Focus input when chat changes
  useEffect(() => {
    if (chat) inputRef.current?.focus();
  }, [chat?._id]);

  const submit = useCallback(
    (e) => {
      e.preventDefault();
      const text = body.trim();
      if (!text) return;
      onSend(text);
      setBody('');
    },
    [body, onSend],
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  if (!chat) {
    return (
      <section className="hidden flex-1 flex-col items-center justify-center gap-4 bg-[#06090f] text-center md:flex">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 h-[400px] w-[400px] rounded-full bg-emerald-500/5 blur-[80px]" />
          <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-[80px]" />
        </div>
        <div
          className="relative grid h-24 w-24 place-items-center rounded-3xl text-white"
          style={{ background: 'linear-gradient(135deg, #00c896, #0ea5e9)', boxShadow: '0 20px 60px rgba(0,200,150,0.25)' }}
        >
          <MessageCircle size={48} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-semibold text-white">PDC Chat</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-400 leading-relaxed">
            Select a conversation from the sidebar or create a new one to get started.
          </p>
        </div>
      </section>
    );
  }

  const other = chatOtherUser(chat, me);

  return (
    <section className={`flex min-w-0 flex-1 flex-col bg-[#06090f] ${chat ? 'flex' : 'hidden md:flex'}`}>
      {/* Chat header */}
      <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#080d1a]/90 px-4 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="mr-1 icon-btn md:hidden"
        >
          <ChevronLeft size={20} />
        </button>
        <Avatar
          name={chat.type === 'group' ? chat.name : other?.name || '?'}
          userId={chat.type === 'group' ? chat._id : other?._id || ''}
          avatarUrl={chat.type === 'direct' ? other?.avatarUrl : null}
          online
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display font-semibold text-white text-sm">{chatTitle(chat, me)}</h2>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
            {typingUsers.length > 0 ? (
              <span className="text-emerald-400 font-medium">
                {typingUsers.map((u) => u.name).join(', ')} typing…
              </span>
            ) : (
              <span>{chat.participants.length} participant{chat.participants.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div
        className="chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-5 sm:px-6"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(0,200,150,0.04) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.04) 0%, transparent 40%)',
        }}
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg._id}
            message={msg}
            own={msg.sender?._id === me._id || msg.sender === me._id}
            chat={chat}
            me={me}
          />
        ))}
        <TypingIndicator users={typingUsers} />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={submit}
        className="flex shrink-0 items-end gap-2 border-t border-white/[0.07] bg-[#080d1a]/90 px-3 py-3 backdrop-blur-xl sm:px-4"
      >
        {/* Emoji picker portal */}
        <div className="relative" ref={emojiPickerRef}>
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className={`emoji-btn shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
              showEmoji
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-400 hover:bg-white/[0.07]'
            }`}
            title="Emoji"
          >
            <Smile size={20} />
          </button>
          {showEmoji && (
            <div
              className="emoji-picker-wrapper"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 10px)',
                left: 0,
                zIndex: 9999,
              }}
            >
              <EmojiPicker
                onEmojiClick={onEmojiClick}
                theme="dark"
                skinTonesDisabled
                searchPlaceholder="Search emoji…"
                lazyLoadEmojis
                previewConfig={{ showPreview: false }}
                style={{
                  '--epr-bg-color': 'rgba(10, 15, 30, 0.96)',
                  '--epr-category-label-bg-color': 'rgba(10, 15, 30, 0.96)',
                  '--epr-hover-bg-color': 'rgba(255,255,255,0.08)',
                  '--epr-focus-bg-color': 'rgba(0,200,150,0.15)',
                  '--epr-text-color': '#e2e8f0',
                  '--epr-search-input-bg-color': 'rgba(255,255,255,0.07)',
                  '--epr-search-input-text-color': '#e2e8f0',
                  '--epr-search-input-placeholder-color': '#64748b',
                  '--epr-search-border-color': 'rgba(255,255,255,0.1)',
                  '--epr-category-icon-active-color': '#00c896',
                  '--epr-border-color': 'rgba(255,255,255,0.07)',
                  '--epr-header-padding': '12px 10px 6px',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,200,150,0.1)',
                  width: '320px',
                }}
              />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-end rounded-2xl bg-white/[0.07] ring-1 ring-white/[0.07] transition-all focus-within:ring-emerald-500/40">
          <textarea
            ref={inputRef}
            className="flex-1 resize-none rounded-2xl bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 leading-relaxed"
            placeholder="Type a message…"
            rows={1}
            value={body}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onChange={(e) => {
              setBody(e.target.value);
              onTyping(e.target.value.length > 0);
            }}
            onBlur={() => onTyping(false)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="submit"
          disabled={!body.trim()}
          className="send-btn shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={17} className="translate-x-0.5" />
        </button>
      </form>
    </section>
  );
}

// ─── New Chat Modal ───────────────────────────────────────────────────────────

function NewChatModal({ onClose, onCreated }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [rawQuery, setRawQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const query = useDebounce(rawQuery, 300);

  useEffect(() => {
    let active = true;
    setSearching(true);
    api
      .get('/users', { params: { q: query } })
      .then(({ data }) => {
        if (active) setUsers(data.users);
      })
      .catch(() => {
        if (active) setUsers([]);
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [query]);

  const toggle = (userId) => {
    setError('');
    setSelected((s) =>
      s.includes(userId) ? s.filter((id) => id !== userId) : [...s, userId],
    );
  };

  const create = async () => {
    if (selected.length === 0) return setError('Select at least one user.');
    if (selected.length > 1 && !groupName.trim()) return setError('Enter a group name.');
    setError('');
    setLoading(true);
    try {
      const endpoint = selected.length === 1 ? '/chats/direct' : '/chats/group';
      const payload =
        selected.length === 1
          ? { participantId: selected[0] }
          : { name: groupName.trim(), participantIds: selected };
      const { data } = await api.post(endpoint, payload);
      onCreated(data.chat);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create chat.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-glass w-full max-w-md overflow-hidden rounded-3xl animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #00c896, #0ea5e9)' }}>
              <Users size={16} />
            </div>
            <h2 className="font-display font-semibold text-white">New conversation</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {/* Search */}
          <label className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 text-slate-400 transition focus-within:bg-white/[0.09]">
            <Search size={15} />
            <input
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="Search users…"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              autoFocus
            />
            {searching && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
            )}
          </label>

          {/* User list */}
          <div className="chat-scroll max-h-64 overflow-y-auto rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]">
            {users.map((user) => {
              const isSelected = selected.includes(user._id);
              return (
                <label
                  key={user._id}
                  className={`flex cursor-pointer items-center gap-3 border-b border-white/[0.05] px-4 py-3 transition last:border-none hover:bg-white/[0.04] ${
                    isSelected ? 'bg-emerald-500/[0.08]' : ''
                  }`}
                >
                  <div
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-white/20'
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => toggle(user._id)}
                  />
                  <Avatar name={user.name} userId={user._id} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                </label>
              );
            })}
            {!searching && users.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
                <Users size={24} className="opacity-40" />
                <p className="text-sm">No users found</p>
              </div>
            )}
          </div>

          {selected.length > 1 && (
            <input
              className="auth-field"
              placeholder="Group name…"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
              <X size={14} />
              {error}
            </div>
          )}

          <button
            onClick={create}
            disabled={loading || selected.length === 0}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating…
              </span>
            ) : (
              `Start ${selected.length > 1 ? 'group ' : ''}conversation`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Connection banner ────────────────────────────────────────────────────────

function ConnectionBanner({ connected }) {
  const [visible, setVisible] = useState(false);
  const prevRef = useRef(connected);

  useEffect(() => {
    // Show banner only when transitioning from connected → disconnected
    if (prevRef.current && !connected) setVisible(true);
    if (!prevRef.current && connected) setTimeout(() => setVisible(false), 2000);
    prevRef.current = connected;
  }, [connected]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-xl ${
        connected
          ? 'bg-emerald-500/90 text-white'
          : 'bg-slate-800 text-slate-200'
      }`}
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? 'Reconnected' : 'Connecting…'}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export function App() {
  const [token, setToken] = useState(storedToken);
  const [me, setMe] = useState(null);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState({});        // { [chatId]: Message[] }
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState({});            // { [chatId]: { [userId]: User } }
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const typingRef = useRef(false);
  const joinedChatIdsRef = useRef(new Set());
  const messageIdsRef = useRef({});                    // { [chatId]: Set<string> } — fast dedup

  // ─── Derived state ───────────────────────────────────────────────────────────

  const selectedChat = useMemo(
    () => chats.find((c) => c._id === selectedChatId),
    [chats, selectedChatId],
  );

  const filteredChats = useMemo(
    () =>
      chats.filter((c) =>
        chatTitle(c, me).toLowerCase().includes(query.toLowerCase()),
      ),
    [chats, me, query],
  );

  const currentMessages = useMemo(
    () => messages[selectedChatId] || [],
    [messages, selectedChatId],
  );

  const typingUsers = useMemo(
    () => Object.values(typing[selectedChatId] || {}),
    [typing, selectedChatId],
  );

  // ─── Auth helpers ────────────────────────────────────────────────────────────

  const applyAuth = useCallback(({ token: t, user }) => {
    localStorage.setItem('token', t);
    setAuthToken(t);
    setToken(t);
    setMe(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    socketRef.current?.disconnect();
    setAuthToken(null);
    setToken(null);
    setMe(null);
    setChats([]);
    setMessages({});
    joinedChatIdsRef.current.clear();
    messageIdsRef.current = {};
  }, []);

  // ─── Message dedup helper ────────────────────────────────────────────────────

  const addMessage = useCallback((chatId, msg) => {
    if (!messageIdsRef.current[chatId]) {
      messageIdsRef.current[chatId] = new Set();
    }
    if (messageIdsRef.current[chatId].has(msg._id)) return; // already have it
    messageIdsRef.current[chatId].add(msg._id);

    setMessages((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), msg],
    }));
  }, []);

  // ─── Initial data load ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    setAuthToken(token);

    (async () => {
      try {
        const [{ data: meData }, { data: chatsData }] = await Promise.all([
          api.get('/auth/me'),
          api.get('/chats'),
        ]);
        setMe(meData.user);
        setChats(chatsData.chats);
        setSelectedChatId((curr) => curr || chatsData.chats[0]?._id || null);
      } catch {
        logout();
      }
    })();
  }, [token]);

  // ─── Socket setup ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);
    socketRef.current = socket;

    const syncJoined = () => {
      socket.emit('reconnect:sync', { chatIds: Array.from(joinedChatIdsRef.current) });
      setConnected(true);
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connection:ready', syncJoined);
    socket.on('reconnect', syncJoined);

    // ✅ FIX: message:new now only fires for OTHER participants (sender excluded via socket.to)
    socket.on('message:new', ({ message }, ack) => {
      const chatId = getMessageChatId(message);
      addMessage(chatId, message);
      setChats((prev) =>
        prev.map((c) => (c._id === chatId ? { ...c, lastMessage: message } : c)),
      );
      ack?.({ ok: true, receivedAt: new Date().toISOString() });
    });

    socket.on('chat:updated', ({ chatId, message }) => {
      setChats((prev) => {
        if (!prev.some((c) => c._id === chatId)) {
          api.get('/chats').then(({ data }) => setChats(data.chats));
          return prev;
        }
        return prev.map((c) =>
          c._id === chatId ? { ...c, lastMessage: message } : c,
        );
      });
    });

    socket.on('typing:start', ({ chatId, user }) => {
      setTyping((prev) => ({
        ...prev,
        [chatId]: { ...(prev[chatId] || {}), [user._id]: user },
      }));
    });

    socket.on('typing:stop', ({ chatId, userId }) => {
      setTyping((prev) => {
        const next = { ...(prev[chatId] || {}) };
        delete next[userId];
        return { ...prev, [chatId]: next };
      });
    });

    socket.on('message:read', ({ chatId, userId, readAt, messageIds = [] }) => {
      setMessages((prev) => {
        const msgs = prev[chatId];
        if (!msgs) return prev;
        let changed = false;
        const next = msgs.map((m) => {
          if (messageIds.length && !messageIds.includes(m._id)) return m;
          if (m.readBy?.some((r) => r.user?._id === userId)) return m;
          changed = true;
          return {
            ...m,
            readBy: [...(m.readBy || []), { user: { _id: userId }, readAt }],
            readCount: (m.readCount || 0) + 1,
          };
        });
        return changed ? { ...prev, [chatId]: next } : prev;
      });
    });

    socket.on('message:delivered', ({ chatId, messageId, userIds, deliveredAt }) => {
      setMessages((prev) => {
        const msgs = prev[chatId];
        if (!msgs) return prev;
        let changed = false;
        const next = msgs.map((m) => {
          if (m._id !== messageId) return m;
          changed = true;
          return { ...m, deliveredTo: userIds.map((id) => ({ _id: id })), deliveredAt };
        });
        return changed ? { ...prev, [chatId]: next } : prev;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [token, addMessage]);

  // ─── Join chat room + load messages ─────────────────────────────────────────

  useEffect(() => {
    if (!selectedChatId || !socketRef.current) return;

    // Join the Socket.IO room
    if (!joinedChatIdsRef.current.has(selectedChatId)) {
      socketRef.current.emit('chat:join', { chatId: selectedChatId }, (res) => {
        if (res?.ok) joinedChatIdsRef.current.add(selectedChatId);
      });
    }

    // Load messages only if not already cached
    if (!messages[selectedChatId]) {
      api.get(`/chats/${selectedChatId}/messages`).then(({ data }) => {
        // Seed the dedup Set with loaded message ids
        messageIdsRef.current[selectedChatId] = new Set(
          data.messages.map((m) => m._id),
        );
        setMessages((prev) => ({ ...prev, [selectedChatId]: data.messages }));
      });
    }
  }, [selectedChatId]); // intentionally exclude messages to avoid loop

  // ─── Send message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (body) => {
      if (!selectedChatId || !socketRef.current) return;

      // ✅ FIX: The server ack returns the message instantly.
      // We add it to local state via the ack — no waiting for broadcast.
      socketRef.current.emit(
        'message:send',
        { chatId: selectedChatId, body },
        (res) => {
          if (!res?.ok || !res.message) return;
          const msg = res.message;
          const chatId = getMessageChatId(msg);
          addMessage(chatId, msg);
          setChats((prev) =>
            prev.map((c) => (c._id === chatId ? { ...c, lastMessage: msg } : c)),
          );
        },
      );

      handleTyping(false);
    },
    [selectedChatId, addMessage],
  );

  const markRead = useCallback((chatId) => {
    socketRef.current?.emit('message:read', { chatId });
  }, []);

  const handleTyping = useCallback(
    (isTyping) => {
      if (!selectedChatId || typingRef.current === isTyping) return;
      typingRef.current = isTyping;
      socketRef.current?.emit(isTyping ? 'typing:start' : 'typing:stop', {
        chatId: selectedChatId,
      });
    },
    [selectedChatId],
  );

  const addChat = useCallback((chat) => {
    setChats((prev) => [chat, ...prev.filter((c) => c._id !== chat._id)]);
    setSelectedChatId(chat._id);
    setModalOpen(false);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!token) return <AuthScreen onAuthed={applyAuth} />;

  if (!me) {
    return (
      <main className="grid min-h-full place-items-center">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
          <span className="text-sm">Loading…</span>
        </div>
      </main>
    );
  }

  return (
    <>
      <ConnectionBanner connected={connected} />
      <main className="mx-auto flex h-full max-h-full w-full max-w-[1600px] p-0 md:h-[calc(100%-28px)] md:px-3 md:pt-3">
        <div className="app-shell flex h-full w-full overflow-hidden md:rounded-3xl">
          <Sidebar
            chats={filteredChats}
            selectedChat={selectedChat}
            me={me}
            onSelect={(c) => setSelectedChatId(c._id)}
            onNewChat={() => setModalOpen(true)}
            onLogout={logout}
            onProfileClick={() => setProfileModalOpen(true)}
            query={query}
            setQuery={setQuery}
            connected={connected}
          />
          <ChatWindow
            chat={selectedChat}
            me={me}
            messages={currentMessages}
            typingUsers={typingUsers}
            onSend={sendMessage}
            onRead={markRead}
            onTyping={handleTyping}
            onBack={() => setSelectedChatId(null)}
          />
        </div>
      </main>
      {modalOpen && <NewChatModal onClose={() => setModalOpen(false)} onCreated={addChat} />}
      {profileModalOpen && (
        <ProfileModal
          me={me}
          onClose={() => setProfileModalOpen(false)}
          onUpdated={(updatedUser) => setMe((prev) => ({ ...prev, ...updatedUser }))}
        />
      )}
    </>
  );
}
