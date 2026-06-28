/**
 * pin.js — PIN entry, PBKDF2-SHA-256 hashing, verification, lockout.
 * PIN salt and hash stored in localStorage. Raw PIN never stored anywhere.
 */

import { hashPIN, generatePINSalt, bufferToBase64, base64ToBuffer } from './crypto.js';

const SALT_KEY = 'ws_pin_salt';
const HASH_KEY = 'ws_pin_hash';
const LOCKOUT_KEY = 'ws_pin_lockout';
const ATTEMPTS_KEY = 'ws_pin_attempts';
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000;

let currentDigits = [];
let onVerifySuccess = null;
let onVerifyFail = null;

/**
 * Creates and stores a new PIN.
 * @param {string} pin - Numeric string (4 or 6 digits).
 * @returns {Promise<void>}
 */
export async function createPIN(pin) {
  const salt = generatePINSalt();
  const hash = await hashPIN(pin, salt);
  localStorage.setItem(SALT_KEY, bufferToBase64(salt));
  localStorage.setItem(HASH_KEY, hash);
  clearLockout();
}

/**
 * Verifies an entered PIN against the stored hash.
 * Enforces attempt limit and lockout.
 * @param {string} pin
 * @returns {Promise<{valid: boolean, locked: boolean, remaining: number}>}
 */
export async function verifyPIN(pin) {
  const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
  if (Date.now() < lockoutUntil) {
    return { valid: false, locked: true, remaining: Math.ceil((lockoutUntil - Date.now()) / 1000) };
  }

  const saltB64 = localStorage.getItem(SALT_KEY);
  const storedHash = localStorage.getItem(HASH_KEY);

  if (!saltB64 || !storedHash) {
    return { valid: false, locked: false, remaining: MAX_ATTEMPTS };
  }

  const salt = base64ToBuffer(saltB64);
  const testHash = await hashPIN(pin, salt);

  if (testHash === storedHash) {
    clearLockout();
    return { valid: true, locked: false, remaining: MAX_ATTEMPTS };
  }

  const attempts = incrementAttempts();
  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
    localStorage.setItem(ATTEMPTS_KEY, '0');
    return { valid: false, locked: true, remaining: Math.ceil(LOCKOUT_MS / 1000) };
  }

  return { valid: false, locked: false, remaining: MAX_ATTEMPTS - attempts };
}

/**
 * Returns true if a PIN has been set up.
 * @returns {boolean}
 */
export function hasPIN() {
  return !!localStorage.getItem(HASH_KEY);
}

/**
 * Renders the full-screen PIN lock overlay and wires up numpad events.
 * @param {Function} onSuccess - Called when PIN is verified correctly.
 * @param {Function} [onCancel] - Called if the user dismisses (optional).
 */
export function showPINScreen(onSuccess, onCancel) {
  onVerifySuccess = onSuccess;

  const overlay = document.getElementById('pin-overlay');
  if (!overlay) return;

  currentDigits = [];
  updateDots();
  clearShakeClass();

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  checkLockoutOnShow();
}

/**
 * Hides the PIN lock screen.
 */
export function hidePINScreen() {
  const overlay = document.getElementById('pin-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  currentDigits = [];
  updateDots();
}

/**
 * Handles a digit press (from numpad click or keyboard).
 * @param {string|number} digit - '0'–'9', 'backspace', or 'clear'.
 */
export async function handleDigit(digit) {
  const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
  if (Date.now() < lockoutUntil) return;

  if (digit === 'backspace') {
    currentDigits.pop();
    updateDots();
    return;
  }

  if (digit === 'clear') {
    currentDigits = [];
    updateDots();
    return;
  }

  const PIN_LENGTH = parseInt(document.getElementById('pin-overlay')?.dataset.pinLength || '4', 10);

  if (currentDigits.length < PIN_LENGTH) {
    currentDigits.push(String(digit));
    updateDots();
  }

  if (currentDigits.length === PIN_LENGTH) {
    const pin = currentDigits.join('');
    currentDigits = [];
    updateDots();
    await attemptVerify(pin);
  }
}

async function attemptVerify(pin) {
  const result = await verifyPIN(pin);

  if (result.valid) {
    hidePINScreen();
    onVerifySuccess?.();
    return;
  }

  if (result.locked) {
    showLockoutMessage(result.remaining);
  } else {
    triggerShake();
    showAttemptsRemaining(result.remaining);
  }
}

function updateDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('pin-dot--filled', i < currentDigits.length);
  });
}

function triggerShake() {
  const dots = document.getElementById('pin-dots');
  if (!dots) return;
  dots.classList.remove('pin-shake');
  void dots.offsetWidth;
  dots.classList.add('pin-shake');
}

function clearShakeClass() {
  document.getElementById('pin-dots')?.classList.remove('pin-shake');
}

function showAttemptsRemaining(remaining) {
  const msg = document.getElementById('pin-message');
  if (msg) {
    msg.textContent = `Incorrect. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`;
    msg.classList.add('pin-message--error');
  }
}

function showLockoutMessage(seconds) {
  const msg = document.getElementById('pin-message');
  if (!msg) return;

  const update = () => {
    const until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    if (left > 0) {
      const mins = Math.floor(left / 60);
      const secs = left % 60;
      msg.textContent = `Locked for ${mins}:${String(secs).padStart(2, '0')}`;
      msg.classList.add('pin-message--error');
      setTimeout(update, 1000);
    } else {
      msg.textContent = 'Enter your PIN';
      msg.classList.remove('pin-message--error');
    }
  };

  update();
}

function checkLockoutOnShow() {
  const until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
  if (Date.now() < until) {
    showLockoutMessage(Math.ceil((until - Date.now()) / 1000));
  }
}

function incrementAttempts() {
  const n = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(n));
  return n;
}

function clearLockout() {
  localStorage.removeItem(LOCKOUT_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
}

/**
 * Binds numpad button clicks in the PIN screen.
 * Call once after the PIN overlay is in the DOM.
 */
export function bindNumpad() {
  document.querySelectorAll('[data-pin-digit]').forEach(btn => {
    btn.addEventListener('click', () => handleDigit(btn.dataset.pinDigit));
  });

  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('pin-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
    if (e.key === 'Backspace') handleDigit('backspace');
  });
}
