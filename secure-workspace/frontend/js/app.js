/**
 * app.js — Main application controller and state machine.
 * Initialises all modules, wires global events, handles URL routing.
 * Entry point: DOMContentLoaded.
 */

import { renderFakeDashboard } from './fakedata.js';
import { openDB } from './storage.js';
import { initPanic, bindPanicButton } from './panic.js';
import { hasPIN, createPIN, showPINScreen, bindNumpad } from './pin.js';
import { initTheme, toggleTheme, showChat, showDashboard, showToast, addRoomTab } from './ui.js';
import { initNotifications } from './notifications.js';
import { createRoom, joinViaInvite, sessions } from './room.js';
import { sendMessage, emitTyping, receiveMessage, receiveReceipt, receiveTyping, receiveReaction, flushQueue } from './messages.js';

const WORKER_URL = window.__WORKER_URL__ || 'https://secure-workspace.your-worker.workers.dev';

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await openDB();

  initTheme();
  initNotifications();
  renderFakeDashboard();

  initPanic(onPanicActivated, onPanicDeactivated);
  bindPanicButton('settings-btn');
  bindNumpad();

  handleInitialRoute();
  wireGlobalEvents();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  document.body.classList.add('dashboard-visible');
  document.body.classList.remove('chat-visible');
});

// ─── Routing ──────────────────────────────────────────────────────────────────

function handleInitialRoute() {
  const path = window.location.pathname;

  if (path.startsWith('/invite/')) {
    const token = path.split('/invite/')[1];
    handleInviteRoute(token);
    return;
  }

  if (path.startsWith('/workspace/')) {
    const roomId = path.split('/workspace/')[1];
    handleWorkspaceRoute(roomId);
    return;
  }
}

async function handleInviteRoute(token, password) {
  try {
    const roomId = await joinViaInvite(token, password);
    history.replaceState(null, '', `/workspace/${roomId}`);
    addRoomTab(roomId, `Room ${roomId.slice(0, 4)}`);
    showChat(roomId);
    wireRoomEvents(roomId);
  } catch (err) {
    if (err.message === 'NEEDS_PASSWORD') {
      promptRoomPassword(token);
    } else if (err.message === 'WRONG_PASSWORD') {
      promptRoomPassword(token, 'Incorrect password. Try again.');
    } else {
      showToast('Invite link is invalid or expired.', 'error');
    }
  }
}

async function handleWorkspaceRoute(roomId) {
  const session = sessions.get(roomId);
  if (session) {
    addRoomTab(roomId, `Room ${roomId.slice(0, 4)}`);
    showChat(roomId);
  } else {
    showToast('Workspace not found. Request a new invite link.', 'error');
    history.replaceState(null, '', '/');
  }
}

// ─── Panic callbacks ──────────────────────────────────────────────────────────

function onPanicActivated() {
  for (const [, session] of sessions) {
    session.socket.pause();
  }
}

function onPanicDeactivated() {
  for (const [, session] of sessions) {
    session.socket.resume();
  }
}

// ─── Global event wiring ──────────────────────────────────────────────────────

function wireGlobalEvents() {
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // Topbar button → open the create-room modal
  document.getElementById('open-room-modal-btn')?.addEventListener('click', () => {
    document.getElementById('create-room-modal')?.classList.remove('hidden');
  });

  // Modal "Create Workspace" button → actually create the room
  document.getElementById('create-room-btn')?.addEventListener('click', async () => {
    const settings = collectRoomSettings();
    document.getElementById('create-room-modal')?.classList.add('hidden');
    try {
      const roomId = await createRoom(settings);
      history.pushState(null, '', `/workspace/${roomId}`);
      addRoomTab(roomId, settings.nickname || `Room ${roomId.slice(0, 4)}`);
      wireRoomEvents(roomId);
      showChat(roomId);
    } catch (err) {
      console.error('createRoom failed:', err);
      showToast('Failed to create workspace. Check your connection.', 'error');
    }
  });

  document.getElementById('back-to-dashboard')?.addEventListener('click', () => {
    history.pushState(null, '', '/');
    showDashboard();
  });

  document.getElementById('lock-btn')?.addEventListener('click', () => {
    if (hasPIN()) {
      showPINScreen(() => {});
    } else {
      promptSetPIN();
    }
  });

  document.getElementById('audit-logo')?.addEventListener('click', handleTripleClick);

  window.addEventListener('popstate', () => handleInitialRoute());
}

/**
 * Wires incoming WebSocket events for a room to the message handlers.
 * @param {string} roomId
 */
export function wireRoomEvents(roomId) {
  const session = sessions.get(roomId);
  if (!session) return;

  const { socket } = session;

  socket.on('message', envelope => receiveMessage(roomId, envelope));
  socket.on('receipt', envelope => receiveReceipt(roomId, envelope));
  socket.on('typing', envelope => receiveTyping(roomId, envelope));
  socket.on('reaction', envelope => receiveReaction(roomId, envelope));
  socket.on('connected', () => flushQueue(roomId));

  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');

  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend(roomId, input);
      } else {
        emitTyping(roomId);
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => doSend(roomId, input));
  }
}

async function doSend(roomId, input) {
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = '';
  await sendMessage(roomId, text);
}

// ─── Room creation settings ───────────────────────────────────────────────────

function collectRoomSettings() {
  return {
    nickname: document.getElementById('room-nickname')?.value.trim() || '',
    inviteExpiry: document.getElementById('invite-expiry')?.value || '7d',
    oneTimeInvite: document.getElementById('one-time-invite')?.checked || false,
    messageDeleteMode: document.getElementById('msg-delete-mode')?.value || '7d',
    selfDestructAfter: document.getElementById('self-destruct')?.value || '7d',
    roomPassword: document.getElementById('room-password')?.value || null,
  };
}

// ─── PIN setup prompt ─────────────────────────────────────────────────────────

function promptSetPIN() {
  const modal = document.getElementById('create-pin-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  document.getElementById('confirm-create-pin')?.addEventListener('click', async () => {
    const pinInput = document.getElementById('new-pin-input');
    const pin = pinInput?.value.trim();
    if (!pin || pin.length < 4) {
      showToast('PIN must be at least 4 digits.', 'error');
      return;
    }
    await createPIN(pin);
    modal.classList.add('hidden');
    showToast('PIN set. You can now lock the workspace.', 'success');
  }, { once: true });
}

function promptRoomPassword(token, errorMsg = '') {
  const modal = document.getElementById('room-password-modal');
  const input = document.getElementById('room-password-input');
  const joinBtn = document.getElementById('confirm-room-password');
  if (!modal || !joinBtn) return;

  // Inline error element — create once, reuse on retries
  let errorEl = modal.querySelector('.pw-modal-error');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'pw-modal-error';
    errorEl.style.cssText = 'color:var(--danger,#ef4444);font-size:0.82rem;margin:6px 0 0;';
    modal.querySelector('.form-group')?.appendChild(errorEl);
  }
  errorEl.textContent = errorMsg;
  errorEl.hidden = !errorMsg;

  if (input) { input.value = ''; input.focus(); }

  // Remove any previous listener before re-attaching
  if (joinBtn._pwClickHandler) {
    joinBtn.removeEventListener('click', joinBtn._pwClickHandler);
  }

  joinBtn._pwClickHandler = () => {
    const password = input?.value;
    if (!password) {
      errorEl.textContent = 'Please enter the room password.';
      errorEl.hidden = false;
      return; // listener stays alive — user can try again
    }
    joinBtn.removeEventListener('click', joinBtn._pwClickHandler);
    delete joinBtn._pwClickHandler;
    modal.classList.add('hidden');
    handleInviteRoute(token, password);
  };

  joinBtn.addEventListener('click', joinBtn._pwClickHandler);
  modal.classList.remove('hidden');
}

// ─── Triple-click audit log reveal ───────────────────────────────────────────

let clickCount = 0;
let clickTimer = null;

function handleTripleClick() {
  clickCount++;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { clickCount = 0; }, 500);

  if (clickCount >= 3) {
    clickCount = 0;
    showAuditLog();
  }
}

async function showAuditLog() {
  const { getAuditLog } = await import('./storage.js');
  const entries = await getAuditLog();
  const modal = document.getElementById('audit-modal');
  const list = document.getElementById('audit-list');

  if (!modal || !list) return;

  list.innerHTML = entries.map(e => `
    <div class="audit-entry">
      <span class="audit-entry__type">${escapeHTML(e.type)}</span>
      <span class="audit-entry__time">${new Date(e.timestamp).toLocaleString()}</span>
    </div>
  `).join('') || '<p>No entries yet.</p>';

  modal.classList.remove('hidden');
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
