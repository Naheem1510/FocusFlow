/**
 * qr.js — QR code generation for invite links using qrcode.js from CDN.
 * All generation is in-browser. No server involvement.
 */

const QR_SIZE = 200;

/**
 * Generates a QR code for an invite URL and renders it into a container element.
 * The container is cleared before rendering.
 *
 * @param {string} inviteUrl - Full invite URL, e.g. https://domain.com/invite/{token}
 * @param {HTMLElement} container - DOM element to render the QR code into.
 */
export function generateQR(inviteUrl, container) {
  container.innerHTML = '';

  // QRCode is loaded from CDN in index.html; check it's available
  if (typeof QRCode === 'undefined') {
    container.textContent = 'QR library not loaded';
    return;
  }

  new QRCode(container, {
    text: inviteUrl,
    width: QR_SIZE,
    height: QR_SIZE,
    colorDark: '#111827',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });
}

/**
 * Shows the "Share Workspace Access" modal with an invite link and QR code.
 *
 * @param {string} token - Invite token returned by the Worker.
 * @param {string} appDomain - Base domain (no trailing slash).
 */
export function showShareModal(token, appDomain) {
  const inviteUrl = `${appDomain}/invite/${encodeURIComponent(token)}`;

  const modal = document.getElementById('share-modal');
  const linkInput = document.getElementById('share-link-input');
  const qrContainer = document.getElementById('share-qr-container');
  const copyBtn = document.getElementById('share-copy-btn');

  if (!modal || !linkInput || !qrContainer) return;

  linkInput.value = inviteUrl;
  generateQR(inviteUrl, qrContainer);

  copyBtn?.addEventListener('click', () => copyInviteLink(inviteUrl, copyBtn), { once: true });

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.focus();
}

/**
 * Hides the share modal.
 */
export function hideShareModal() {
  const modal = document.getElementById('share-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Copies the invite link to the clipboard and shows brief visual feedback.
 * @param {string} url
 * @param {HTMLElement} btn
 */
async function copyInviteLink(url, btn) {
  try {
    await navigator.clipboard.writeText(url);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 2000);
  } catch {
    // Fallback for browsers blocking clipboard access
    const input = document.getElementById('share-link-input');
    if (input) {
      input.select();
      document.execCommand('copy');
    }
  }
}
