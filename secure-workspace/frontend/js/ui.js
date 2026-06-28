/**
 * ui.js — Dashboard/chat view toggling, tab bar, room tabs, DOM helpers.
 * Manages body class state machine that drives CSS visibility.
 */

import { sessions, switchRoom, activeRoomId, closeRoom } from './room.js';
import { onEnterChat, onLeaveChat } from './notifications.js';

/** @type {'dashboard'|'chat'} */
let currentView = 'dashboard';

/**
 * Switches to the chat view with an optional cross-fade transition.
 * @param {string} roomId - Room to show.
 */
export function showChat(roomId) {
  document.body.classList.remove('dashboard-visible');
  document.body.classList.add('chat-visible');
  currentView = 'chat';

  document.title = 'Collaboration Stream';
  setFavicon('/assets/favicon.ico');

  switchRoom(roomId);
  onEnterChat();
}

/**
 * Switches back to the dashboard view with a cross-fade transition.
 */
export function showDashboard() {
  document.body.classList.remove('chat-visible');
  document.body.classList.add('dashboard-visible');
  currentView = 'dashboard';

  document.title = 'Workspace Dashboard';
  setFavicon('/assets/favicon.ico');

  onLeaveChat();
}

/**
 * @returns {'dashboard'|'chat'}
 */
export function getCurrentView() {
  return currentView;
}

// ─── Room tab bar ─────────────────────────────────────────────────────────────

/**
 * Adds a new room tab to the tab bar.
 * @param {string} roomId
 * @param {string} nickname
 */
export function addRoomTab(roomId, nickname) {
  const tabBar = document.getElementById('room-tabs');
  if (!tabBar) return;

  const existing = tabBar.querySelector(`[data-room-tab="${roomId}"]`);
  if (existing) return;

  const tab = document.createElement('button');
  tab.className = 'room-tab';
  tab.dataset.roomTab = roomId;
  tab.setAttribute('aria-label', `Open ${nickname}`);

  const label = document.createElement('span');
  label.className = 'room-tab__label';
  label.textContent = nickname;

  const badge = document.createElement('span');
  badge.className = 'room-tab__badge hidden';
  badge.dataset.unreadBadge = roomId;

  const close = document.createElement('button');
  close.className = 'room-tab__close';
  close.setAttribute('aria-label', 'Close room');
  close.innerHTML = '&times;';
  close.addEventListener('click', async e => {
    e.stopPropagation();
    await closeRoom(roomId);
    removeRoomTab(roomId);
  });

  tab.appendChild(label);
  tab.appendChild(badge);
  tab.appendChild(close);
  tab.addEventListener('click', () => showChat(roomId));

  tabBar.appendChild(tab);
}

/**
 * Removes a room tab from the tab bar.
 * @param {string} roomId
 */
export function removeRoomTab(roomId) {
  document.querySelector(`[data-room-tab="${roomId}"]`)?.remove();
}

/**
 * Sets the active styling on a room tab.
 * @param {string} roomId
 */
export function setActiveTab(roomId) {
  document.querySelectorAll('.room-tab').forEach(tab => {
    tab.classList.toggle('room-tab--active', tab.dataset.roomTab === roomId);
  });
}

/**
 * Updates the unread badge count on a specific room tab.
 * @param {string} roomId
 * @param {number} count
 */
export function setTabUnread(roomId, count) {
  const badge = document.querySelector(`[data-unread-badge="${roomId}"]`);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

// ─── Theme ────────────────────────────────────────────────────────────────────

/**
 * Initialises theme from localStorage, falling back to system preference.
 */
export function initTheme() {
  const saved = localStorage.getItem('ws_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

/**
 * Toggles between light and dark mode.
 */
export function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('ws_theme', theme);

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

// ─── Modals ───────────────────────────────────────────────────────────────────

/**
 * Shows a modal by ID.
 * @param {string} modalId
 */
export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.focus();

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      hideModal(modalId);
      document.removeEventListener('keydown', escHandler);
    }
  });
}

/**
 * Hides a modal by ID.
 * @param {string} modalId
 */
export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setFavicon(href) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Shows a transient toast notification at the bottom of the screen.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
