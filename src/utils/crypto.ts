/**
 * crypto.ts — Password utilities & E2EE primitives.
 *
 * Fix #7: verifyPassword now supports both:
 *   - PBKDF2 (new, secure) — used when saltHex is provided
 *   - SHA-256 (legacy migration path) — used when no salt is stored yet
 *
 * The hashPassword/verifyPassword SHA-256 pair is kept ONLY for backward
 * compatibility during migration. All new password setups use PBKDF2.
 */

// ─── Legacy SHA-256 (migration path only) ────────────────────────────────────

/** Hash a password with bare SHA-256. Used ONLY for migrating legacy accounts. */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a password against a stored hash.
 *
 * Supports two modes:
 *   1. PBKDF2 (saltHex provided): derives authHash via PBKDF2 and compares.
 *   2. Legacy SHA-256 (no saltHex): simple SHA-256 compare for migration.
 *
 * @returns `{ ok: boolean; upgraded: boolean }` — `upgraded` is true when a
 *          legacy SHA-256 hash was detected so the caller can upgrade it.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  saltHex?: string
): Promise<{ ok: boolean; upgraded: boolean }> {
  if (saltHex) {
    // Primary path: PBKDF2 comparison
    const salt = hexToBytes(saltHex);
    const { authHash } = await deriveKeyAndAuthHash(password, salt);
    if (authHash === storedHash) {
      return { ok: true, upgraded: false };
    }
    // Stored hash might still be legacy SHA-256 — check and signal upgrade needed
    const legacyHash = await hashPassword(password);
    if (legacyHash === storedHash) {
      return { ok: true, upgraded: true }; // Caller should re-store PBKDF2 hash
    }
    return { ok: false, upgraded: false };
  }

  // Fallback: no salt stored (very old installs without PBKDF2 setup)
  const legacyHash = await hashPassword(password);
  return { ok: legacyHash === storedHash, upgraded: false };
}

// ─── PBKDF2 Key Derivation ───────────────────────────────────────────────────

/**
 * Derives a 256-bit AES-GCM key and a 256-bit auth hash from a password + salt.
 * Uses PBKDF2 with HMAC-SHA256 and 100,000 iterations.
 *
 * The first 32 bytes → AES-GCM encryption key (non-extractable CryptoKey).
 * The second 32 bytes → hex auth hash (sent to server for identity verification).
 * The server NEVER receives the encryption key.
 */
export async function deriveKeyAndAuthHash(
  password: string,
  salt: Uint8Array
): Promise<{ encryptionKey: CryptoKey; authHash: string }> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    512 // 64 bytes total
  );

  const keyBytes  = derivedBits.slice(0, 32);
  const authBytes = derivedBits.slice(32, 64);

  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,           // non-extractable — DevTools cannot read this key
    ['encrypt', 'decrypt']
  );

  const authHash = Array.from(new Uint8Array(authBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { encryptionKey, authHash };
}

// ─── AES-GCM Encryption / Decryption ────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-GCM.
 * Returns the ciphertext and a randomly generated 12-byte IV.
 */
export async function encryptPayload(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    data
  );

  return { ciphertext, iv };
}

/**
 * Decrypts a ciphertext ArrayBuffer using AES-GCM.
 * Returns the decrypted plaintext string.
 */
export async function decryptPayload(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decryptedBuffer);
}

// ─── Hex Utilities ───────────────────────────────────────────────────────────

/** Converts a Uint8Array to a lowercase hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Converts a hex string back to a Uint8Array. */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ─── Base64 Chunked Utilities ─────────────────────────────────────────────────

/** Converts an ArrayBuffer to a Base64 string in safe chunks to avoid stack overflow. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 16384;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/** Converts a Base64 string back to an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Industry-Standard Encrypted Backup Specification ────────────────────────

export interface MFLedgerBackupEnvelope {
  app: 'MFLedger';
  version: number;
  format: 'MFLEDGER_ENCRYPTED_BACKUP';
  createdAt: string;
  schemaVersion?: number;
  kdf: {
    algorithm: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string; // hex
  };
  cipher: {
    algorithm: 'AES-256-GCM';
    iv: string; // hex
  };
  ciphertext: string; // base64
}

/**
 * Encrypts a database snapshot string using industry standard PBKDF2 (100k iterations)
 * and AES-256-GCM.
 * Generates a fresh random 16-byte salt and 12-byte IV per export.
 * Returns a self-describing JSON string envelope containing all parameters needed
 * to restore on any device with the user's password.
 */
export async function encryptBackupPayload(
  snapshotJson: string,
  password: string,
  schemaVersion: number = 12
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100_000;

  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const data = encoder.encode(snapshotJson);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    aesKey,
    data
  );

  const envelope: MFLedgerBackupEnvelope = {
    app: 'MFLedger',
    version: 2,
    format: 'MFLEDGER_ENCRYPTED_BACKUP',
    createdAt: new Date().toISOString(),
    schemaVersion,
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToHex(salt),
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      iv: bytesToHex(iv),
    },
    ciphertext: arrayBufferToBase64(ciphertext),
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Decrypts a backup payload (either JSON string or ArrayBuffer) using the user-entered password.
 * Derives the key using PBKDF2 with the salt and iteration count embedded in the backup envelope.
 *
 * Throws a clean, user-friendly error if decryption fails (e.g. incorrect password or corrupted file).
 */
export async function decryptBackupPayload(
  fileContent: string | ArrayBuffer,
  password: string
): Promise<{ snapshotJson: string; metadata: { createdAt?: string; version?: number } }> {
  const textContent = typeof fileContent === 'string'
    ? fileContent
    : (() => {
        try {
          return new TextDecoder().decode(fileContent);
        } catch {
          return '';
        }
      })();
  const rawBuffer: ArrayBuffer | null = typeof fileContent !== 'string' ? fileContent : null;

  // Try parsing as JSON envelope
  let envelope: any = null;
  if (textContent) {
    try {
      const parsed = JSON.parse(textContent);
      if (parsed && typeof parsed === 'object' && (parsed.format === 'MFLEDGER_ENCRYPTED_BACKUP' || parsed.ciphertext)) {
        envelope = parsed;
      }
    } catch {
      // Not JSON
    }
  }

  if (envelope && envelope.ciphertext && envelope.kdf?.salt && envelope.cipher?.iv) {
    const salt = hexToBytes(envelope.kdf.salt);
    const iv = hexToBytes(envelope.cipher.iv);
    const iterations = envelope.kdf.iterations || 100_000;
    const ciphertextBuffer = base64ToArrayBuffer(envelope.ciphertext);

    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as any,
        iterations,
        hash: envelope.kdf.hash || 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as any },
        aesKey,
        ciphertextBuffer
      );
      const snapshotJson = new TextDecoder().decode(decryptedBuffer);
      return {
        snapshotJson,
        metadata: {
          createdAt: envelope.createdAt,
          version: envelope.version,
        },
      };
    } catch {
      throw new Error('Incorrect password or corrupted backup file.');
    }
  }

  // Fallback: Legacy binary payload without salt [12 bytes IV] + [ciphertext]
  if (rawBuffer && rawBuffer.byteLength >= 28) {
    throw new Error('This appears to be an older legacy backup format that does not contain a salt envelope. Please restore from an original device session or use a v2 backup.');
  }

  throw new Error('Invalid or unreadable backup file format.');
}

