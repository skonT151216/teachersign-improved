import { scryptAsync } from '@noble/hashes/scrypt.js';
const encoder = new TextEncoder();
export const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function randomHex(size = 16) { return hex(crypto.getRandomValues(new Uint8Array(size))); }
export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function browserPassword(password, salt = randomHex()) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256 || !/^[a-f0-9]{32}$/.test(salt)) throw new Error('[ERR-ACCOUNT] 암호는 12~256자로 입력하세요.');
  const bytes = encoder.encode(password);
  try {
    const key = await scryptAsync(bytes, encoder.encode(salt), { N: 32768, r: 8, p: 3, dkLen: 64, maxmem: 64 * 1024 * 1024, asyncTick: 8 });
    try { return `scrypt$32768$8$3$${salt}$${hex(key)}`; }
    finally { key.fill(0); }
  } finally { bytes.fill(0); }
}
export const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
export async function passwordProof(verifier, fields) {
  const raw = Uint8Array.from(verifier.split('$')[5].match(/../g), pair => parseInt(pair, 16));
  try {
    const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(fields)))));
  } finally { raw.fill(0); }
}
