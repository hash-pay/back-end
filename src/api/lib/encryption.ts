import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const ivLength = 12; // Recommended length for GCM
const key = crypto
  .createHash('sha256')
  .update(String(process.env.ENCRYPTION_SECRET))
  .digest(); // 32-byte key for AES-256

export function encryptPrivateKey(plainText) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

export function decryptPrivateKey(cipherHex) {
  const buffer = Buffer.from(cipherHex, 'hex');
  const iv = buffer.slice(0, ivLength);
  const tag = buffer.slice(ivLength, ivLength + 16);
  const encrypted = buffer.slice(ivLength + 16);

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
