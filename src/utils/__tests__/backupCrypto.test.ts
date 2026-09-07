import { describe, it, expect } from 'vitest';
import {
  encryptBackupPayload,
  decryptBackupPayload,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  bytesToHex,
  hexToBytes,
} from '../crypto';

describe('Backup Cryptography & Envelope Specification', () => {
  const sampleSnapshot = JSON.stringify({
    version: 12,
    timestamp: 1725450000000,
    tables: {
      profiles: [{ id: 'prof_1', name: 'Primary User', system_role: 'PRIMARY', is_active: 1, deleted_at: 0 }],
      accounts: [{ id: 'acc_1', name: 'HDFC Savings', type: 'ASSET', subtype: 'SAVINGS', currency: 'INR', profile_id: 'prof_1', is_joint: 0, is_archived: 0, deleted_at: 0 }],
      transaction_groups: [],
      transaction_entries: [],
      envelope_groups: [],
      envelopes: [],
      budget_allocations: [],
      investment_lots: [],
      lot_consumption_events: [],
      tax_rules: [],
      recurring_templates: [],
      notes: [],
      app_settings: [{ key: 'theme', value: 'system' }],
      market_cache: [],
      automation_rules: [],
      goals: [],
      goal_contributions: [],
    },
  });

  const testPassword = 'mock-test-passphrase-fixture';

  it('correctly converts ArrayBuffer to Base64 and back in chunks', () => {
    const originalBytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const b64 = arrayBufferToBase64(originalBytes.buffer);
    const restoredBuffer = base64ToArrayBuffer(b64);
    const restoredBytes = new Uint8Array(restoredBuffer);
    expect(restoredBytes).toEqual(originalBytes);
  });

  it('encrypts database snapshot into industry-standard envelope with PBKDF2 + AES-256-GCM', async () => {
    const envelopeJson = await encryptBackupPayload(sampleSnapshot, testPassword, 12);
    const envelope = JSON.parse(envelopeJson);

    expect(envelope.app).toBe('MFLedger');
    expect(envelope.version).toBe(2);
    expect(envelope.format).toBe('MFLEDGER_ENCRYPTED_BACKUP');
    expect(envelope.schemaVersion).toBe(12);
    expect(envelope.createdAt).toBeDefined();

    // KDF parameters
    expect(envelope.kdf.algorithm).toBe('PBKDF2');
    expect(envelope.kdf.hash).toBe('SHA-256');
    expect(envelope.kdf.iterations).toBe(100_000);
    expect(envelope.kdf.salt).toHaveLength(32); // 16 bytes in hex

    // Cipher parameters
    expect(envelope.cipher.algorithm).toBe('AES-256-GCM');
    expect(envelope.cipher.iv).toHaveLength(24); // 12 bytes in hex

    // Ciphertext
    expect(typeof envelope.ciphertext).toBe('string');
    expect(envelope.ciphertext.length).toBeGreaterThan(50);
  });

  it('successfully decrypts backup with the correct password', async () => {
    const envelopeJson = await encryptBackupPayload(sampleSnapshot, testPassword);
    const { snapshotJson, metadata } = await decryptBackupPayload(envelopeJson, testPassword);

    expect(snapshotJson).toBe(sampleSnapshot);
    expect(metadata.version).toBe(2);
    expect(metadata.createdAt).toBeDefined();
  });

  it('successfully decrypts when provided with an ArrayBuffer (file upload simulation)', async () => {
    const envelopeJson = await encryptBackupPayload(sampleSnapshot, testPassword);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(envelopeJson).buffer;

    const { snapshotJson } = await decryptBackupPayload(buffer, testPassword);
    expect(snapshotJson).toBe(sampleSnapshot);
  });

  it('fails decryption and throws clear error when wrong password is used', async () => {
    const envelopeJson = await encryptBackupPayload(sampleSnapshot, testPassword);

    await expect(
      decryptBackupPayload(envelopeJson, 'WrongPassword123!')
    ).rejects.toThrow('Incorrect password or corrupted backup file.');
  });

  it('fails decryption and rejects tampered ciphertext', async () => {
    const envelopeJson = await encryptBackupPayload(sampleSnapshot, testPassword);
    const envelope = JSON.parse(envelopeJson);

    // Tamper with one base64 character in the ciphertext
    const b64 = envelope.ciphertext;
    const tamperedB64 = b64.charAt(0) === 'A' ? 'B' + b64.slice(1) : 'A' + b64.slice(1);
    envelope.ciphertext = tamperedB64;

    await expect(
      decryptBackupPayload(JSON.stringify(envelope), testPassword)
    ).rejects.toThrow('Incorrect password or corrupted backup file.');
  });

  it('rejects invalid or garbage file format', async () => {
    await expect(
      decryptBackupPayload('{"random": "json"}', testPassword)
    ).rejects.toThrow('Invalid or unreadable backup file format.');
  });
});
