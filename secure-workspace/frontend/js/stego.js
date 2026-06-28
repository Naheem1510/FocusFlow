/**
 * stego.js — LSB steganography: hide encrypted text inside PNG images.
 * All processing in-browser using Canvas API. Doubly protected: stego + AES-GCM.
 * The image looks visually identical to the original.
 */

const MAGIC_BYTES = [0x57, 0x53, 0x54, 0x31]; // "WST1" — marks a stego image
const BITS_PER_BYTE = 8;

// ─── Encoding ──────────────────────────────────────────────────────────────────

/**
 * Hides an encrypted text payload inside a PNG image using LSB of the red channel.
 * The image must have at least (payload_bytes + 8) * 8 pixels.
 *
 * @param {File|Blob} imageFile - Cover image (any format readable by canvas).
 * @param {string} encryptedText - Base64 or plaintext to hide (already encrypted).
 * @returns {Promise<Blob>} PNG blob with the payload embedded in LSBs.
 */
export async function hideMessageInImage(imageFile, encryptedText) {
  const img = await loadImage(imageFile);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  const textBytes = new TextEncoder().encode(encryptedText);
  const length = textBytes.byteLength;

  // Capacity check: we use 1 bit per pixel (red channel LSB)
  // Header: 4 magic bytes + 4 length bytes = 8 bytes = 64 bits = 64 pixels
  const totalBitsNeeded = (MAGIC_BYTES.length + 4 + length) * BITS_PER_BYTE;
  const availablePixels = (data.length / 4);
  if (totalBitsNeeded > availablePixels) {
    throw new Error(`Image too small. Need ${totalBitsNeeded} pixels, have ${availablePixels}.`);
  }

  const payload = new Uint8Array([
    ...MAGIC_BYTES,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...textBytes,
  ]);

  encodeLSB(data, payload);

  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, 'image/png');
}

/**
 * Extracts a hidden payload from an LSB-encoded PNG.
 * Returns null if no valid magic bytes are found (i.e. not a stego image).
 *
 * @param {File|Blob} imageFile
 * @returns {Promise<string|null>} Extracted string or null.
 */
export async function extractMessageFromImage(imageFile) {
  const img = await loadImage(imageFile);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  // Read magic bytes + length (8 bytes = 64 bits)
  const header = decodeLSB(data, 0, 8);

  // Validate magic
  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (header[i] !== MAGIC_BYTES[i]) return null;
  }

  const length =
    (header[4] << 24) | (header[5] << 16) | (header[6] << 8) | header[7];

  if (length <= 0 || length > 1_000_000) return null;

  const payload = decodeLSB(data, 8, length);
  return new TextDecoder().decode(payload);
}

// ─── LSB bit manipulation ─────────────────────────────────────────────────────

/**
 * Encodes bytes into the least significant bit of the red channel.
 * @param {Uint8ClampedArray} pixelData - Raw RGBA pixel data (modified in place).
 * @param {Uint8Array} payload - Bytes to embed.
 */
function encodeLSB(pixelData, payload) {
  let bitIndex = 0;

  for (let i = 0; i < payload.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      const pixelOffset = bitIndex * 4; // red channel of pixel `bitIndex`
      const messageBit = (payload[i] >> bit) & 1;

      // Replace LSB of red channel
      pixelData[pixelOffset] = (pixelData[pixelOffset] & 0xfe) | messageBit;
      bitIndex++;
    }
  }
}

/**
 * Decodes bytes from LSBs of the red channel starting at byte offset.
 * @param {Uint8ClampedArray} pixelData
 * @param {number} byteOffset - Start byte position in the logical stream.
 * @param {number} byteCount - Number of bytes to extract.
 * @returns {Uint8Array}
 */
function decodeLSB(pixelData, byteOffset, byteCount) {
  const result = new Uint8Array(byteCount);

  for (let i = 0; i < byteCount; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const pixelIndex = (byteOffset + i) * BITS_PER_BYTE + (7 - bit);
      const pixelOffset = pixelIndex * 4;
      const lsb = pixelData[pixelOffset] & 1;
      byte |= lsb << bit;
    }
    result[i] = byte;
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Loads an image File/Blob into an HTMLImageElement.
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/**
 * Converts a canvas to a PNG Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, type, 1.0);
  });
}
