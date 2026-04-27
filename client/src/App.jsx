import {
  Bell,
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
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setAuthToken } from './lib/api.js';
import { createSocket } from './lib/socket.js';

const storedToken = localStorage.getItem('token');

const AVATAR_COLORS = [
  ['#00c896', '#0ea5e9'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#3b82f6'],
  ['#22c55e', '#14b8a6'],
  ['#8b5cf6', '#ec4899'],
];

const initials = (name = '') =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const timeLabel = (date) =>
  new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const relativeDay = (date) => {
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
};

const formatTimestamp = (date) => `${relativeDay(date)} at ${timeLabel(date)}`;

const formatLastSeen = (date) => {
  if (!date) return 'Offline';
  return `Last seen ${formatTimestamp(date).toLowerCase()}`;
};

const chatTitle = (chat, me) => {
  if (chat.type === 'group') return chat.name;
  return chat.participants.find((participant) => participant._id !== me?._id)?.name || 'Direct chat';
};

const chatOtherUser = (chat, me) => {
  if (chat.type === 'group') return null;
  return chat.participants.find((participant) => participant._id !== me?._id) || null;
};

const avatarGradient = (value = '') => {
  const index = value ? value.charCodeAt(value.length - 1) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[index];
};

const getMessageChatId = (message) =>
  typeof message.chat === 'string' ? message.chat : message.chat?._id;

const sortNotifications = (items = []) =>
  [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const countUnreadNotifications = (items = []) =>
  items.reduce((count, notification) => count + (notification.isRead ? 0 : 1), 0);

const buildOnlineUserMap = (userIds = []) =>
  userIds.reduce((acc, userId) => {
    acc[userId] = true;
    return acc;
  }, {});

const isUserOnline = (onlineUsers, userId) => Boolean(userId && onlineUsers[userId]);

const presenceLabelForUser = (user, onlineUsers) =>
  isUserOnline(onlineUsers, user?._id) ? 'Online' : formatLastSeen(user?.lastSeenAt);

const getMessageStatus = (message, meId, participantCount) => {
  const seenCount =
    message.readBy?.filter((entry) => entry.user?._id && entry.user._id !== meId).length || 0;
  const deliveredCount = message.deliveredTo?.length || 0;
  const recipientCount = Math.max(participantCount - 1, 0);

  if (seenCount > 0) return 'seen';
  if (recipientCount > 0 && deliveredCount >= recipientCount) return 'delivered';
  return 'sent';
};

const syncChatPreview = (chats, chatId, message) => {
  const index = chats.findIndex((chat) => chat._id === chatId);
  if (index === -1) return chats;

  const next = [...chats];
  const [matched] = next.splice(index, 1);
  next.unshift({ ...matched, lastMessage: message });
  return next;
};

const buildLiveNotification = ({ chat, message, me }) => {
  const sender =
    typeof message.sender === 'string'
      ? chat.participants.find((participant) => participant._id === message.sender)
      : message.sender;
  const title = sender?.name || chatTitle(chat, me);
  const body = message.body || 'New message';

  return {
    _id: `live:${message._id}`,
    chat,
    message: typeof message._id === 'string' ? message._id : message._id?._id,
    title,
    body,
    status: 'delivered',
    channel: 'in-app',
    isRead: false,
    readAt: null,
    deliveredToClientAt: new Date().toISOString(),
    createdAt: message.createdAt || new Date().toISOString(),
    localOnly: true,
  };
};

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function Avatar({ name = '', userId = '', size = 'md', online = false, avatarUrl = null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [colorA, colorB] = avatarGradient(userId || name);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const src =
    avatarUrl && !imageFailed
      ? avatarUrl.startsWith('http')
        ? avatarUrl
        : `${apiBase}${avatarUrl}`
      : null;
  const sizeClass =
    size === 'lg'
      ? 'h-14 w-14 text-base'
      : size === 'sm'
        ? 'h-8 w-8 text-xs'
        : 'h-11 w-11 text-sm';
  const dotClass = size === 'lg' ? 'h-4 w-4 border-[3px]' : 'h-3 w-3 border-2';

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClass} overflow-hidden rounded-2xl font-bold text-white shadow-lg`}
        style={{ background: `linear-gradient(135deg, ${colorA}, ${colorB})` }}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center">{initials(name)}</div>
        )}
      </div>
      {online && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotClass} rounded-full border-white bg-emerald-400`}
          style={{ boxShadow: '0 0 10px rgba(52,211,153,0.35)' }}
        />
      )}
    </div>
  );
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#7d96ff]/18 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#ffbfd3]/22 blur-[120px]" />
      </div>

      <section className="auth-glass relative w-full max-w-md rounded-3xl p-8">
        <div className="mb-8 flex items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl text-white"
            style={{ background: 'linear-gradient(135deg, #7691ff, #5c74e8)', boxShadow: '0 18px 34px rgba(92,116,232,0.22)' }}
          >
            <MessageCircle size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-800">PDC Chat</h1>
            <p className="text-xs font-medium text-slate-500">Distributed realtime messaging</p>
          </div>
        </div>

        <div className="mb-6 flex rounded-2xl bg-[#eff3ff] p-1">
          {['login', 'register'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                mode === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {value === 'login' ? 'Sign In' : 'Register'}
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
            <div className="flex items-center gap-2 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-600">
              <X size={14} />
              {error}
            </div>
          )}

          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProfileModal({ me, onClose, onUpdated }) {
  const [preview, setPreview] = useState(me?.avatarUrl || null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const previewSrc =
    preview && !preview.startsWith('blob:')
      ? preview.startsWith('http')
        ? preview
        : `${apiBase}${preview}`
      : preview;

  const handleFileChange = (e) => {
    const nextFile = e.target.files?.[0];
    if (!nextFile) return;
    if (nextFile.size > 5 * 1024 * 1024) {
      setError('File must be under 5 MB');
      return;
    }

    setError('');
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: 'rgba(112,123,154,0.24)', backdropFilter: 'blur(10px)' }}
    >
      <div className="modal-glass relative w-full max-w-sm rounded-3xl p-6">
        <button onClick={onClose} className="absolute right-4 top-4 icon-btn">
          <X size={18} />
        </button>

        <h2 className="mb-6 font-display text-lg font-bold text-slate-800">Profile picture</h2>

        <div className="mb-6 flex flex-col items-center gap-4">
          <button
            type="button"
            className="profile-avatar-ring relative h-28 w-28 overflow-hidden rounded-full"
            onClick={() => fileRef.current?.click()}
          >
            {previewSrc ? (
              <img src={previewSrc} alt={me?.name} className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-3xl font-bold text-white"
                style={{
                  background: `linear-gradient(135deg, ${avatarGradient(me?._id || me?.name || '')[0]}, ${avatarGradient(me?._id || me?.name || '')[1]})`,
                }}
              >
                {initials(me?.name)}
              </div>
            )}
            <div className="profile-avatar-overlay absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity">
              <Camera size={22} className="text-white" />
            </div>
          </button>

          <div className="text-center">
            <p className="font-semibold text-slate-800">{me?.name}</p>
            <p className="text-xs text-slate-500">{me?.email}</p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />

        {error && (
          <div className="mb-4 rounded-xl bg-rose-100 px-3 py-2 text-center text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-2xl bg-[#edf2ff] py-3 text-sm font-semibold text-[#5c74e8] transition hover:bg-[#e3ebff]"
          >
            Choose photo
          </button>

          {file && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7691ff, #5c74e8)' }}
            >
              {uploading ? 'Uploading...' : 'Save photo'}
            </button>
          )}

          {me?.avatarUrl && !file && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="rounded-2xl bg-red-500/10 py-3 text-sm font-medium text-red-400 ring-1 ring-red-500/20 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove photo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  chats,
  selectedChat,
  me,
  onSelect,
  onNewChat,
  onLogout,
  onProfileClick,
  query,
  setQuery,
  connected,
  onlineUsers,
  unreadNotificationCount,
  onToggleNotifications,
}) {
  return (
    <aside
      className={`flex h-full border-r border-slate-200/70 ${
        selectedChat ? 'hidden md:flex md:w-[390px] lg:w-[430px]' : 'flex w-full md:w-[390px] lg:w-[430px]'
      }`}
    >
      <div className="sidebar-rail hidden w-[112px] shrink-0 flex-col items-center px-4 py-6 text-white md:flex">
        <div className="mb-8 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ffd25f]" />
          <span className="h-3 w-3 rounded-full bg-[#ff8e7b]" />
          <span className="h-3 w-3 rounded-full bg-[#9cf080]" />
        </div>

        <button
          type="button"
          onClick={onProfileClick}
          className="relative mb-10 flex flex-col items-center gap-3 text-center"
        >
          <Avatar name={me?.name} userId={me?._id} online={connected} avatarUrl={me?.avatarUrl} size="lg" />
          <div className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold tracking-[0.24em] text-white/90">
            {connected ? 'LIVE' : 'SYNC'}
          </div>
        </button>

        <div className="flex w-full flex-1 flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => setQuery('')}
            className="flex w-full flex-col items-center gap-2 rounded-[26px] bg-white/14 px-3 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:bg-white/18"
          >
            <MessageCircle size={21} />
            <span className="text-[11px] font-semibold">Chats</span>
          </button>

          <button
            type="button"
            onClick={onToggleNotifications}
            className="relative flex w-full flex-col items-center gap-2 rounded-[24px] px-3 py-4 text-white/90 transition hover:bg-white/10"
          >
            <Bell size={20} />
            <span className="text-[11px] font-semibold">Alerts</span>
            {unreadNotificationCount > 0 && (
              <span className="absolute right-5 top-3 min-w-[20px] rounded-full bg-white px-1.5 text-[10px] font-bold leading-5 text-[#5b75eb]">
                {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full flex-col items-center gap-2 rounded-[24px] px-3 py-4 text-white/90 transition hover:bg-white/10"
          >
            <Users size={20} />
            <span className="text-[11px] font-semibold">People</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-auto flex w-full flex-col items-center gap-2 rounded-[24px] px-3 py-4 text-white/85 transition hover:bg-white/10"
        >
          <LogOut size={20} />
          <span className="text-[11px] font-semibold">Exit</span>
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[#f9fbff]/92">
        <header className="border-b border-slate-200/70 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Workspace
              </p>
              <h1 className="mt-2 truncate font-display text-[28px] font-extrabold tracking-tight text-slate-800">
                Messages
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {chats.length} active conversation{chats.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onNewChat}
                className="icon-btn hidden md:inline-grid"
                title="New chat"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={onProfileClick}
                className="md:hidden"
                title="Profile"
                type="button"
              >
                <Avatar
                  name={me?.name}
                  userId={me?._id}
                  online={connected}
                  avatarUrl={me?.avatarUrl}
                  size="sm"
                />
              </button>
              <button onClick={onToggleNotifications} className="icon-btn relative md:hidden" title="Notifications">
                <Bell size={18} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#5b75eb] px-1 text-[10px] font-bold leading-[18px] text-white">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>
              <button onClick={onNewChat} className="icon-btn md:hidden" title="New chat">
                <Plus size={18} />
              </button>
              <button onClick={onLogout} className="icon-btn md:hidden" title="Sign out">
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <label className="surface-card mt-5 flex items-center gap-3 rounded-[22px] px-4 py-3 text-slate-400 transition focus-within:border-slate-300 focus-within:bg-white">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="Search conversations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-400 transition hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </label>
        </header>

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {chats.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
              <MessageCircle size={34} className="opacity-60" />
              <p className="text-sm">{query ? 'No chats match your search' : 'No conversations yet'}</p>
            </div>
          )}

          {chats.map((chat) => {
            const other = chatOtherUser(chat, me);
            const active = selectedChat?._id === chat._id;
            return (
              <button
                key={chat._id}
                onClick={() => onSelect(chat)}
                className={`mb-2 flex w-full items-center gap-3 rounded-[26px] px-4 py-4 text-left transition ${
                  active
                    ? 'bg-white shadow-[0_16px_34px_rgba(102,122,168,0.18)] ring-1 ring-[#d9e2fb]'
                    : 'hover:bg-white/90 hover:shadow-[0_10px_24px_rgba(115,132,173,0.08)]'
                }`}
              >
                <Avatar
                  name={chat.type === 'group' ? chat.name : other?.name || '?'}
                  userId={chat.type === 'group' ? chat._id : other?._id || ''}
                  online={chat.type === 'direct' && isUserOnline(onlineUsers, other?._id)}
                  avatarUrl={chat.type === 'direct' ? other?.avatarUrl : null}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-bold text-slate-800">{chatTitle(chat, me)}</p>
                    {chat.lastMessage?.createdAt && (
                      <span className="shrink-0 text-[11px] font-medium text-slate-400">
                        {timeLabel(chat.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {chat.lastMessage?.body || (chat.type === 'group' ? 'Group chat' : 'Direct message')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function NotificationPanel({
  open,
  notifications,
  unreadCount,
  onClose,
  onMarkAllRead,
  onMarkRead,
  onSelectNotification,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: 'rgba(100, 112, 145, 0.24)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute right-4 top-4 w-[min(430px,calc(100vw-2rem))] overflow-hidden rounded-[30px] border border-white/80 bg-[rgba(255,255,255,0.92)] shadow-[0_28px_70px_rgba(72,92,138,0.18)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-800">Notifications</h2>
            <p className="text-xs text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="rounded-full bg-[#edf2ff] px-3 py-1.5 text-xs font-semibold text-[#5c74e8] transition hover:bg-[#e3ebff] disabled:opacity-50"
            >
              Mark all read
            </button>
            <button onClick={onClose} className="icon-btn">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="chat-scroll max-h-[70vh] overflow-y-auto">
          {notifications.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-slate-400">
              <Bell size={28} className="opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          )}

          {notifications.map((notification) => (
            <div
              key={notification._id}
              className={`border-b border-slate-200/70 px-5 py-4 last:border-none ${
                notification.isRead ? 'bg-transparent' : 'bg-[#eff3ff]'
              }`}
            >
              <button onClick={() => onSelectNotification(notification)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{notification.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {notification.chat?.type === 'group' ? notification.chat?.name : 'Direct message'}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#5c74e8]" />
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{notification.body}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400">
                    {formatTimestamp(notification.createdAt)}
                  </span>
                  {!notification.isRead && (
                    <span className="text-[11px] font-semibold text-[#5c74e8]">Open chat</span>
                  )}
                </div>
              </button>

              {!notification.isRead && (
                <div className="mt-3">
                  <button
                    onClick={() => onMarkRead(notification._id)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                  >
                    Mark as read
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, own, chat, me }) {
  const status = own ? getMessageStatus(message, me._id, chat.participants.length) : null;

  return (
    <div className={`flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
      {!own && chat.type === 'group' && (
        <Avatar
          name={message.sender?.name || '?'}
          userId={message.sender?._id || ''}
          avatarUrl={message.sender?.avatarUrl || null}
          size="sm"
        />
      )}

      <div
        className={`max-w-[82%] rounded-[24px] px-4 py-3 sm:max-w-[68%] ${
          own
            ? 'rounded-br-[10px] text-white'
            : 'rounded-bl-[10px] bg-white text-slate-700 shadow-[0_10px_26px_rgba(103,118,159,0.1)] ring-1 ring-slate-200/70'
        }`}
        style={
          own
            ? {
                background: 'linear-gradient(135deg, #7691ff 0%, #5c74e8 100%)',
                boxShadow: '0 14px 30px rgba(92,116,232,0.22)',
              }
            : {}
        }
      >
        {chat.type === 'group' && !own && (
          <p className="mb-1 text-[11px] font-bold text-[#5c74e8]">{message.sender?.name}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{message.body}</p>
        <div className={`mt-1.5 flex items-center justify-end gap-1 text-[10.5px] ${own ? 'text-white/70' : 'text-slate-400'}`}>
          <span>{timeLabel(message.createdAt)}</span>
          {own && status === 'sent' && <Check size={13} />}
          {own && status === 'delivered' && <CheckCheck size={13} />}
          {own && status === 'seen' && <CheckCheck size={13} className="text-[#d7e3ff]" />}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ users }) {
  if (!users.length) return null;
  return (
    <div className="flex items-end gap-2">
      <div className="rounded-[22px] rounded-bl-[10px] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(103,118,159,0.1)] ring-1 ring-slate-200/70">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{users.map((user) => user.name).join(', ')}</span>
          <div className="ml-1 flex gap-1">
            {[0, 140, 280].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-[#5c74e8]"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatWindow({
  chat,
  me,
  messages,
  typingUsers,
  onSend,
  onRead,
  onTyping,
  onBack,
  onlineUsers,
  onOpenNotifications,
}) {
  const [body, setBody] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const emojiPickerRef = useRef(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chat?._id]);

  useEffect(() => {
    if (chat) onRead(chat._id);
  }, [chat?._id, messages.length, onRead]);

  useEffect(() => {
    if (chat) inputRef.current?.focus();
  }, [chat?._id]);

  const onEmojiClick = useCallback((emojiData) => {
    const emoji = emojiData.emoji;
    const textarea = inputRef.current;
    if (!textarea) {
      setBody((prev) => prev + emoji);
      setShowEmoji(false);
      onTyping(true);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextBody = body.slice(0, start) + emoji + body.slice(end);
    setBody(nextBody);
    setShowEmoji(false);
    onTyping(true);

    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    });
  }, [body, onTyping]);

  const submit = useCallback((e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    onSend(text);
    setBody('');
  }, [body, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  if (!chat) {
    return (
      <section className="hidden flex-1 flex-col items-center justify-center gap-4 bg-[#f6f8fd] text-center md:flex">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-[#7d96ff]/10 blur-[80px]" />
          <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-[#ffc4d8]/14 blur-[80px]" />
        </div>
        <div
          className="relative grid h-24 w-24 place-items-center rounded-[30px] text-white"
          style={{ background: 'linear-gradient(135deg, #7691ff, #5c74e8)', boxShadow: '0 20px 60px rgba(92,116,232,0.22)' }}
        >
          <MessageCircle size={48} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold text-slate-800">PDC Chat</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            Select a conversation from the sidebar or create a new one to get started.
          </p>
        </div>
      </section>
    );
  }

  const other = chatOtherUser(chat, me);

  return (
    <section className={`relative flex min-w-0 flex-1 flex-col bg-[#f6f8fd] ${chat ? 'flex' : 'hidden md:flex'}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[10%] h-44 w-44 rounded-full bg-[#7d96ff]/10 blur-[70px]" />
        <div className="absolute bottom-[6%] right-[12%] h-52 w-52 rounded-full bg-[#ffc6d8]/14 blur-[80px]" />
      </div>

      <header className="relative flex h-[88px] shrink-0 items-center gap-3 border-b border-slate-200/70 bg-[rgba(255,255,255,0.55)] px-4 backdrop-blur-xl sm:px-6">
        <button onClick={onBack} className="mr-1 icon-btn md:hidden">
          <ChevronLeft size={20} />
        </button>
        <Avatar
          name={chat.type === 'group' ? chat.name : other?.name || '?'}
          userId={chat.type === 'group' ? chat._id : other?._id || ''}
          avatarUrl={chat.type === 'direct' ? other?.avatarUrl : null}
          online={chat.type === 'direct' && isUserOnline(onlineUsers, other?._id)}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[24px] font-extrabold tracking-tight text-slate-800">
            {chatTitle(chat, me)}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            {typingUsers.length > 0 ? (
              <span className="font-semibold text-[#5c74e8]">
                {typingUsers.map((user) => user.name).join(', ')} typing...
              </span>
            ) : chat.type === 'direct' ? (
              <span>{presenceLabelForUser(other, onlineUsers)}</span>
            ) : (
              <span>{chat.participants.length} participant{chat.participants.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <button onClick={onBack} className="icon-btn" title="Back to list">
            <ChevronLeft size={18} />
          </button>
          <button onClick={onOpenNotifications} className="icon-btn" title="Notifications">
            <Bell size={18} />
          </button>
        </div>
      </header>

      <div
        className="chat-scroll relative min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-6 sm:px-8"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0)), radial-gradient(circle at 20% 22%, rgba(125,150,255,0.06) 0%, transparent 36%), radial-gradient(circle at 80% 82%, rgba(255,198,216,0.08) 0%, transparent 36%)',
        }}
      >
        {messages.map((message) => (
          <MessageBubble
            key={message._id}
            message={message}
            own={message.sender?._id === me._id || message.sender === me._id}
            chat={chat}
            me={me}
          />
        ))}
        <TypingIndicator users={typingUsers} />
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="relative shrink-0 border-t border-slate-200/70 bg-[rgba(255,255,255,0.64)] px-4 py-4 backdrop-blur-xl sm:px-6"
      >
        <div className="relative flex items-end gap-3">
          <div className="relative" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => setShowEmoji((prev) => !prev)}
              className={`icon-btn ${showEmoji ? 'bg-white text-slate-700' : ''}`}
              title="Add emoji"
            >
              <Smile size={18} />
            </button>

            {showEmoji && (
              <div className="absolute bottom-12 left-0 z-50 shadow-2xl">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme="light"
                  width={320}
                  height={400}
                  previewConfig={{ showPreview: false }}
                  searchDisabled={false}
                  skinTonesDisabled
                />
              </div>
            )}
          </div>

          <textarea
            ref={inputRef}
            className="chat-scroll min-h-[54px] max-h-32 flex-1 resize-none rounded-[24px] border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#cbd7ff] focus:shadow-[0_0_0_4px_rgba(110,140,255,0.12)]"
            placeholder={`Message ${chatTitle(chat, me)}...`}
            rows={1}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              onTyping(e.target.value.trim().length > 0);
            }}
            onBlur={() => onTyping(false)}
            onKeyDown={handleKeyDown}
          />

          <button
            type="submit"
            disabled={!body.trim()}
            className="send-btn disabled:opacity-50"
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

function NewChatModal({ onClose, onCreated }) {
  const [rawQuery, setRawQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debouncedQuery = useDebounce(rawQuery, 250);

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/users', {
          params: debouncedQuery.trim() ? { q: debouncedQuery.trim() } : {},
        });
        if (!cancelled) {
          setUsers(data.users || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Unable to search users');
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    };

    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const toggleUser = (userId) => {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((value) => value !== userId) : [...prev, userId],
    );
  };

  const createChat = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    setError('');

    try {
      const endpoint = selected.length === 1 ? '/chats/direct' : '/chats/group';
      const payload =
        selected.length === 1
          ? { participantId: selected[0] }
          : { name: groupName.trim(), participantIds: selected };

      const { data } = await api.post(endpoint, payload);
      onCreated(data.chat);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(112,123,154,0.24)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-glass w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-800">New conversation</h2>
            <p className="text-xs text-slate-500">Pick one user for direct chat or several for a group.</p>
          </div>
          <button onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <label className="surface-card flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-slate-400 transition focus-within:bg-white">
            <Search size={15} />
            <input
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="Search users..."
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              autoFocus
            />
            {searching && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
            )}
          </label>

          <div className="chat-scroll max-h-64 overflow-y-auto rounded-2xl bg-[#f5f7fd] ring-1 ring-slate-200/70">
            {users.map((user) => {
              const checked = selected.includes(user._id);
              return (
                <label
                  key={user._id}
                  className={`flex cursor-pointer items-center gap-3 border-b border-slate-200/70 px-4 py-3 transition last:border-none hover:bg-white ${
                    checked ? 'bg-[#edf2ff]' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleUser(user._id)}
                  />
                  <div
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                      checked ? 'border-[#5c74e8] bg-[#5c74e8]' : 'border-slate-300'
                    }`}
                  >
                    {checked && <Check size={12} className="text-white" />}
                  </div>
                  <Avatar name={user.name} userId={user._id} size="sm" avatarUrl={user.avatarUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                </label>
              );
            })}

            {!searching && users.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                <Users size={24} className="opacity-40" />
                <p className="text-sm">No users found</p>
              </div>
            )}
          </div>

          {selected.length > 1 && (
            <input
              className="auth-field"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-600">
              <X size={14} />
              {error}
            </div>
          )}

          <button
            onClick={createChat}
            disabled={loading || selected.length === 0 || (selected.length > 1 && groupName.trim().length < 2)}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Creating...' : `Start ${selected.length > 1 ? 'group ' : ''}conversation`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectionBanner({ connected }) {
  const [visible, setVisible] = useState(false);
  const previous = useRef(connected);

  useEffect(() => {
    if (previous.current && !connected) {
      setVisible(true);
    }

    if (!previous.current && connected) {
      setVisible(true);
      const timeout = setTimeout(() => setVisible(false), 2000);
      previous.current = connected;
      return () => clearTimeout(timeout);
    }

    previous.current = connected;
    return undefined;
  }, [connected]);

  if (!visible) return null;

  return (
    <div
      className={`fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur-xl ${
        connected
          ? 'border-white/80 bg-white/90 text-[#5c74e8]'
          : 'border-slate-300 bg-white/90 text-slate-600'
      }`}
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? 'Reconnected' : 'Connecting...'}
    </div>
  );
}

export function App() {
  const [token, setToken] = useState(storedToken);
  const [me, setMe] = useState(null);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState({});
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState({});
  const [storedNotifications, setStoredNotifications] = useState([]);
  const [liveNotifications, setLiveNotifications] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const typingRef = useRef(false);
  const joinedChatIdsRef = useRef(new Set());
  const messageIdsRef = useRef({});
  const audioContextRef = useRef(null);
  const unreadCountRef = useRef(0);
  const selectedChatIdRef = useRef(selectedChatId);
  const meRef = useRef(me);
  const chatsRef = useRef(chats);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat._id === selectedChatId) || null,
    [chats, selectedChatId],
  );

  const filteredChats = useMemo(
    () => chats.filter((chat) => chatTitle(chat, me).toLowerCase().includes(query.toLowerCase())),
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

  const notifications = useMemo(
    () => sortNotifications([...storedNotifications, ...liveNotifications]),
    [storedNotifications, liveNotifications],
  );

  const unreadNotificationCount = useMemo(
    () => countUnreadNotifications(notifications),
    [notifications],
  );

  const syncNotifications = useCallback((items) => {
    setStoredNotifications(sortNotifications(items || []));
  }, []);

  const touchChat = useCallback((chatId, message) => {
    setChats((prev) => syncChatPreview(prev, chatId, message));
  }, []);

  const playNotificationTone = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const audioContext = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      const now = audioContext.currentTime;
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      master.connect(audioContext.destination);

      [740, 987].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.05);
        oscillator.connect(master);
        oscillator.start(now + index * 0.05);
        oscillator.stop(now + 0.18 + index * 0.06);
      });
    } catch {
      // Ignore sound failures caused by browser autoplay restrictions.
    }
  }, []);

  const pushLiveNotification = useCallback((chatId, message) => {
    setLiveNotifications((prev) => {
      if (prev.some((notification) => notification.message === message._id)) {
        return prev;
      }

      const chat = chatsRef.current.find((entry) => entry._id === chatId);
      if (!chat || !meRef.current) {
        return prev;
      }

      return sortNotifications([buildLiveNotification({ chat, message, me: meRef.current }), ...prev]);
    });
  }, []);

  const ensureBackgroundNotification = useCallback(async (chatId, message) => {
    const isOwnMessage =
      message.sender?._id === meRef.current?._id || message.sender === meRef.current?._id;

    if (isOwnMessage || selectedChatIdRef.current === chatId) {
      return;
    }

    if (chatsRef.current.some((chat) => chat._id === chatId)) {
      pushLiveNotification(chatId, message);
      playNotificationTone();
      return;
    }

    try {
      const { data } = await api.get('/chats');
      const nextChats = data.chats || [];
      setChats(nextChats);
      chatsRef.current = nextChats;

      if (nextChats.some((chat) => chat._id === chatId)) {
        pushLiveNotification(chatId, message);
        playNotificationTone();
      }
    } catch {
      // ignore
    }
  }, [playNotificationTone, pushLiveNotification]);

  const loadNotifications = useCallback(async () => {
    const { data } = await api.get('/notifications');
    syncNotifications(data.notifications || []);
  }, [syncNotifications]);

  const updateUserPresenceInChats = useCallback((userId, lastSeenAt) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.type !== 'direct') return chat;

        const participants = chat.participants.map((participant) =>
          participant._id === userId
            ? {
                ...participant,
                ...(lastSeenAt ? { lastSeenAt } : {}),
              }
            : participant,
        );

        return { ...chat, participants };
      }),
    );
  }, []);

  const applyPresenceUpdate = useCallback((userId, online, lastSeenAt = null) => {
    setOnlineUsers((prev) => {
      if (online) {
        if (prev[userId]) return prev;
        return { ...prev, [userId]: true };
      }

      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    updateUserPresenceInChats(userId, lastSeenAt);
  }, [updateUserPresenceInChats]);

  const addMessage = useCallback((chatId, message) => {
    if (!messageIdsRef.current[chatId]) {
      messageIdsRef.current[chatId] = new Set();
    }

    if (messageIdsRef.current[chatId].has(message._id)) {
      return;
    }

    messageIdsRef.current[chatId].add(message._id);
    setMessages((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), message],
    }));
  }, []);

  const applyAuth = useCallback(({ token: nextToken, user }) => {
    localStorage.setItem('token', nextToken);
    setAuthToken(nextToken);
    setToken(nextToken);
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
    setTyping({});
    setStoredNotifications([]);
    setLiveNotifications([]);
    setOnlineUsers({});
    setConnected(false);
    setNotificationsOpen(false);
    joinedChatIdsRef.current.clear();
    messageIdsRef.current = {};
  }, []);

  const markNotificationRead = useCallback(async (notificationId) => {
    if (notificationId.startsWith('live:')) {
      const readAt = new Date().toISOString();
      setLiveNotifications((prev) =>
        prev.map((notification) =>
          notification._id === notificationId ? { ...notification, isRead: true, readAt } : notification,
        ),
      );
      return;
    }

    const { data } = await api.patch(`/notifications/${notificationId}/read`);
    setStoredNotifications((prev) =>
      sortNotifications(
        prev.map((notification) =>
          notification._id === notificationId ? data.notification : notification,
        ),
      ),
    );
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (unreadNotificationCount === 0) return;
    const readAt = new Date().toISOString();
    setLiveNotifications((prev) =>
      prev.map((notification) =>
        notification.isRead
          ? notification
          : { ...notification, isRead: true, readAt, deliveredToClientAt: readAt },
      ),
    );

    const storedUnread = storedNotifications.some((notification) => !notification.isRead);
    if (!storedUnread) return;

    await api.patch('/notifications/read-all');
    setStoredNotifications((prev) =>
      prev.map((notification) =>
        notification.isRead
          ? notification
          : { ...notification, isRead: true, readAt, deliveredToClientAt: readAt },
      ),
    );
  }, [storedNotifications, unreadNotificationCount]);

  const handleNotificationSelect = useCallback(async (notification) => {
    setNotificationsOpen(false);

    if (notification.chat?._id) {
      setSelectedChatId(notification.chat._id);
      if (!chats.some((chat) => chat._id === notification.chat._id)) {
        const { data } = await api.get('/chats');
        setChats(data.chats || []);
      }
    }

    if (!notification.isRead) {
      try {
        await markNotificationRead(notification._id);
      } catch {
        // Ignore temporary mark-read failures so opening the chat still works.
      }
    }
  }, [chats, markNotificationRead]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    unreadCountRef.current = unreadNotificationCount;
  }, [unreadNotificationCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const unlockAudio = () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  useEffect(() => {
    if (!token) return;
    setAuthToken(token);

    let cancelled = false;

    (async () => {
      try {
        const [{ data: meData }, { data: chatsData }, { data: notificationsData }] = await Promise.all([
          api.get('/auth/me'),
          api.get('/chats'),
          api.get('/notifications'),
        ]);

        if (cancelled) return;

        setMe(meData.user);
        setChats(chatsData.chats || []);
        syncNotifications(notificationsData.notifications || []);
        setSelectedChatId((current) => current || chatsData.chats?.[0]?._id || null);
      } catch {
        if (!cancelled) {
          logout();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, logout, syncNotifications]);

  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);
    socketRef.current = socket;

    const syncJoinedRooms = () => {
      socket.emit('reconnect:sync', { chatIds: Array.from(joinedChatIdsRef.current) });
      setConnected(true);
      loadNotifications().catch(() => {});
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connection:ready', syncJoinedRooms);
    socket.on('reconnect', syncJoinedRooms);

    socket.on('presence:snapshot', ({ userIds = [] }) => {
      setOnlineUsers(buildOnlineUserMap(userIds));
    });

    socket.on('presence:online', ({ userId }) => {
      applyPresenceUpdate(userId, true);
    });

    socket.on('presence:offline', ({ userId, lastSeenAt }) => {
      applyPresenceUpdate(userId, false, lastSeenAt);
    });

    socket.on('notifications:sync', ({ notifications: items = [] }) => {
      if (countUnreadNotifications(items) > unreadCountRef.current) {
        playNotificationTone();
      }
      syncNotifications(items);
    });

    socket.on('message:new', ({ message }, ack) => {
      const chatId = getMessageChatId(message);
      const isOwnMessage =
        message.sender?._id === meRef.current?._id || message.sender === meRef.current?._id;
      const isBackgroundChat = selectedChatIdRef.current !== chatId;

      addMessage(chatId, message);
      touchChat(chatId, message);

      if (!isOwnMessage && isBackgroundChat) {
        pushLiveNotification(chatId, message);
      }

      if (!isOwnMessage) {
        playNotificationTone();
      }

      ack?.({ ok: true, receivedAt: new Date().toISOString() });
    });

    socket.on('chat:updated', ({ chatId, message }) => {
      ensureBackgroundNotification(chatId, message);
      setChats((prev) => {
        if (!prev.some((chat) => chat._id === chatId)) {
          api.get('/chats').then(({ data }) => setChats(data.chats || []));
          return prev;
        }

        return syncChatPreview(prev, chatId, message);
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
        const chatMessages = prev[chatId];
        if (!chatMessages) return prev;

        let changed = false;
        const nextMessages = chatMessages.map((message) => {
          if (messageIds.length && !messageIds.includes(message._id)) {
            return message;
          }

          if (message.readBy?.some((entry) => entry.user?._id === userId)) {
            return message;
          }

          changed = true;
          return {
            ...message,
            readBy: [...(message.readBy || []), { user: { _id: userId }, readAt }],
            readCount: (message.readCount || 0) + 1,
          };
        });

        return changed ? { ...prev, [chatId]: nextMessages } : prev;
      });
    });

    socket.on('message:delivered', ({ chatId, messageId, userIds, deliveredAt }) => {
      setMessages((prev) => {
        const chatMessages = prev[chatId];
        if (!chatMessages) return prev;

        let changed = false;
        const nextMessages = chatMessages.map((message) => {
          if (message._id !== messageId) return message;
          changed = true;
          return {
            ...message,
            deliveredTo: userIds.map((userId) => ({ _id: userId })),
            deliveredAt,
          };
        });

        return changed ? { ...prev, [chatId]: nextMessages } : prev;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [token, addMessage, applyPresenceUpdate, ensureBackgroundNotification, loadNotifications, playNotificationTone, pushLiveNotification, syncNotifications, touchChat]);

  useEffect(() => {
    if (!selectedChatId || !socketRef.current) return;

    if (!joinedChatIdsRef.current.has(selectedChatId)) {
      socketRef.current.emit('chat:join', { chatId: selectedChatId }, (response) => {
        if (response?.ok) {
          joinedChatIdsRef.current.add(selectedChatId);
        }
      });
    }

    if (!messages[selectedChatId]) {
      api.get(`/chats/${selectedChatId}/messages`).then(({ data }) => {
        messageIdsRef.current[selectedChatId] = new Set(data.messages.map((message) => message._id));
        setMessages((prev) => ({ ...prev, [selectedChatId]: data.messages }));
      });
    }
  }, [selectedChatId, messages]);

  const sendMessage = useCallback((body) => {
    if (!selectedChatId || !socketRef.current) return;

    socketRef.current.emit('message:send', { chatId: selectedChatId, body }, (response) => {
      if (!response?.ok || !response.message) return;

      const message = response.message;
      const chatId = getMessageChatId(message);
      addMessage(chatId, message);
      touchChat(chatId, message);
    });

    typingRef.current = false;
    socketRef.current.emit('typing:stop', { chatId: selectedChatId });
  }, [selectedChatId, addMessage, touchChat]);

  const markChatRead = useCallback((chatId) => {
    socketRef.current?.emit('message:read', { chatId });
  }, []);

  const handleTyping = useCallback((typingNow) => {
    if (!selectedChatId || typingRef.current === typingNow) return;
    typingRef.current = typingNow;
    socketRef.current?.emit(typingNow ? 'typing:start' : 'typing:stop', { chatId: selectedChatId });
  }, [selectedChatId]);

  const addChat = useCallback((chat) => {
    setChats((prev) => [chat, ...prev.filter((existing) => existing._id !== chat._id)]);
    setSelectedChatId(chat._id);
    setModalOpen(false);
  }, []);

  if (!token) return <AuthScreen onAuthed={applyAuth} />;

  if (!me) {
    return (
      <main className="grid min-h-full place-items-center">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
          <span className="text-sm">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <>
      <ConnectionBanner connected={connected} />
      <NotificationPanel
        open={notificationsOpen}
        notifications={notifications}
        unreadCount={unreadNotificationCount}
        onClose={() => setNotificationsOpen(false)}
        onMarkAllRead={() => {
          markAllNotificationsRead().catch(() => {});
        }}
        onMarkRead={(notificationId) => {
          markNotificationRead(notificationId).catch(() => {});
        }}
        onSelectNotification={(notification) => {
          handleNotificationSelect(notification).catch(() => {});
        }}
      />

      <main className="shell-stage flex h-full max-h-full w-full p-0">
        <div className="app-shell relative z-10 flex h-full w-full overflow-hidden rounded-none">
          <Sidebar
            chats={filteredChats}
            selectedChat={selectedChat}
            me={me}
            onSelect={(chat) => setSelectedChatId(chat._id)}
            onNewChat={() => setModalOpen(true)}
            onLogout={logout}
            onProfileClick={() => setProfileModalOpen(true)}
            query={query}
            setQuery={setQuery}
            connected={connected}
            onlineUsers={onlineUsers}
            unreadNotificationCount={unreadNotificationCount}
            onToggleNotifications={() => setNotificationsOpen((prev) => !prev)}
          />

          <ChatWindow
            chat={selectedChat}
            me={me}
            messages={currentMessages}
            typingUsers={typingUsers}
            onSend={sendMessage}
            onRead={markChatRead}
            onTyping={handleTyping}
            onBack={() => setSelectedChatId(null)}
            onlineUsers={onlineUsers}
            onOpenNotifications={() => setNotificationsOpen(true)}
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
