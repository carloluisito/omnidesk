/**
 * Token Encryption Module
 *
 * Provides AES-256-GCM encryption/decryption for secure storage of GitHub Personal Access Tokens.
 * Uses machine-specific key derivation for additional security.
 */

import crypto from 'crypto';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

/**
 * Derive encryption key from machine-specific identifier and salt
 * Uses PBKDF2 for secure key derivation
 */
function deriveKey(salt: Buffer): Buffer {
  // Use machine-specific data for key derivation
  const machineId = getMachineIdentifier();

  // Derive key using PBKDF2 with high iteration count
  return crypto.pbkdf2Sync(
    machineId,
    salt,
    100000, // iterations
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Get machine-specific identifier for key derivation
 * Combines hostname and network interfaces for uniqueness
 */
function getMachineIdentifier(): string {
  const hostname = os.hostname();
  const networkInterfaces = os.networkInterfaces();

  // Use MAC addresses as part of machine ID
  const macAddresses = Object.values(networkInterfaces)
    .flat()
    .filter(iface => iface && !iface.internal && iface.mac !== '00:00:00:00:00:00')
    .map(iface => iface!.mac)
    .sort()
    .join(':');

  return `${hostname}:${macAddresses}`;
}

/**
 * Encrypt a GitHub Personal Access Token
 *
 * @param token - Plaintext token (e.g., ghp_xxxx or github_pat_xxxx)
 * @returns Encrypted token in format: salt:iv:authTag:encryptedData (base64)
 */
export function encryptToken(token: string): string {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }

  // Validate token format
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    console.warn('[TokenEncryption] Token does not match expected format (ghp_* or github_pat_*)');
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive encryption key
  const key = deriveKey(salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt token
  let encrypted = cipher.update(token, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine salt:iv:authTag:encrypted (all base64)
  const result = [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted
  ].join(':');

  console.log('[TokenEncryption] Token encrypted successfully');
  return result;
}

/**
 * Decrypt a GitHub Personal Access Token
 *
 * @param encryptedToken - Encrypted token in format: salt:iv:authTag:encryptedData (base64)
 * @returns Decrypted plaintext token
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken || typeof encryptedToken !== 'string') {
    throw new Error('Encrypted token must be a non-empty string');
  }

  try {
    // Split encrypted token into components
    const parts = encryptedToken.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted token format (expected salt:iv:authTag:data)');
    }

    const [saltB64, ivB64, authTagB64, encryptedDataB64] = parts;

    // Decode from base64
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encryptedData = Buffer.from(encryptedDataB64, 'base64');

    // Validate lengths
    if (salt.length !== SALT_LENGTH) {
      throw new Error(`Invalid salt length: ${salt.length} (expected ${SALT_LENGTH})`);
    }
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${iv.length} (expected ${IV_LENGTH})`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: ${authTag.length} (expected ${AUTH_TAG_LENGTH})`);
    }

    // Derive decryption key
    const key = deriveKey(salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt token
    let decrypted = decipher.update(encryptedData, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    console.log('[TokenEncryption] Token decrypted successfully');
    return decrypted;
  } catch (error) {
    console.error('[TokenEncryption] Decryption failed:', error instanceof Error ? error.message : error);
    throw new Error('Failed to decrypt token. Token may be corrupted or encrypted on a different machine.');
  }
}

/**
 * Validate that a string is an encrypted token
 *
 * @param value - String to validate
 * @returns True if value appears to be an encrypted token
 */
export function isEncryptedToken(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const parts = value.split(':');
  if (parts.length !== 4) {
    return false;
  }

  // Check if all parts are valid base64
  return parts.every(part => {
    try {
      Buffer.from(part, 'base64');
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Clear sensitive data from memory
 * Overwrites buffer with random data before deletion
 *
 * @param buffer - Buffer containing sensitive data
 */
export function clearSensitiveData(buffer: Buffer | string): void {
  if (Buffer.isBuffer(buffer)) {
    // Overwrite with random data
    crypto.randomFillSync(buffer);
  }
}
