/**
 * panic.js — Panic mode: instant hide, PIN-protected restore.
 * Activation: triple-ESC within 1s, Ctrl+Shift+D, or hidden settings button.
 * Deactivation: correct PIN entry.
 */

import { renderFakeDashboard } from './fakedata.js';

const ESC_WINDOW_MS = 1000;
const PANIC_STATE_KEY = 'ws_panic';

let escPressTimestamps = [];
let panicCallbacks = [];

/**
 * Initialises panic mode key listeners. Call once on app start.
 * @param {Function} onPanic - Called when panic activates.
 * @param {Function} onRestore - Called when PIN unlocks panic mode.
 */
export function initPanic(onPanic, onRestore) {
  panicCallbacks = [onPanic, onRestore];

  document.addEventListener('keydown', handleKeyDown);

  if (sessionStorage.getItem(PANIC_STATE_KEY) === '1') {
    activatePanic(false);
  }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    const now = Date.now();
    escPressTimestamps = escPressTimestamps.filter(t => now - t < ESC_WINDOW_MS);
    escPressTimestamps.push(now);
    if (escPressTimestamps.length >= 3) {
      escPressTimestamps = [];
      activatePanic();
    }
  }

  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    activatePanic();
  }
}

/**
 * Activates panic mode — hides chat, shows dashboard, queues socket.
 * Must complete in under 100ms; no animations.
 * @param {boolean} persist - Whether to write to sessionStorage (default true).
 */
export function activatePanic(persist = true) {
  const body = document.body;

  // Instant DOM class toggle — no transitions
  body.classList.remove('chat-visible');
  body.classList.add('dashboard-visible');
  body.classList.add('panic-active');

  // Clear message DOM but not IndexedDB
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) chatMessages.innerHTML = '';

  // Restore browser chrome to neutral state
  document.title = 'Workspace Dashboard';
  setFavicon('/assets/favicon.ico');

  if (persist) {
    sessionStorage.setItem(PANIC_STATE_KEY, '1');
  }

  // Refresh fake dashboard so it looks freshly loaded
  renderFakeDashboard();

  // Notify app controller (will pause socket sends)
  panicCallbacks[0]?.();
}

/**
 * Deactivates panic mode after successful PIN verification.
 * Restores chat view and resumes socket.
 */
export function deactivatePanic() {
  const body = document.body;

  body.classList.remove('dashboard-visible');
  body.classList.remove('panic-active');
  body.classList.add('chat-visible');

  document.title = 'Collaboration Stream';
  sessionStorage.removeItem(PANIC_STATE_KEY);

  panicCallbacks[1]?.();
}

/**
 * @returns {boolean} True if panic mode is currently active.
 */
export function isPanicActive() {
  return document.body.classList.contains('panic-active');
}

/**
 * Wires up the hidden panic button (disguised as settings icon).
 * @param {string} buttonId - ID of the settings-icon button element.
 */
export function bindPanicButton(buttonId) {
  const btn = document.getElementById(buttonId);
  if (btn) btn.addEventListener('click', () => activatePanic());
}

function setFavicon(href) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}
