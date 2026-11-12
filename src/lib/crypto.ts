/**
 * Small Web Crypto helpers for the encrypted sync file:
 *
 *   "NHSY" | version(1) | salt(16) | iv(12) | AES-256-GCM(gzip(JSON))
 *
 * The key comes from your sync password via PBKDF2-SHA-256 (310 000 iterations).
 * It is derived once and kept on the device as a non-extractable CryptoKey.
 */

const MAGIC = 'NHSY';
const VERSION = 1;
const HEADER = 4 + 1 + 16 + 12;

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export const randomSalt = () => crypto.getRandomValues(new Uint8Array(16));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Encrypt a JSON-serialisable value into the sync file format. */
export async function encryptJson(value: unknown, key: CryptoKey, salt: Uint8Array): Promise<Uint8Array> {
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource));
  const out = new Uint8Array(HEADER + cipher.length);
  out.set(new TextEncoder().encode(MAGIC), 0);
  out[4] = VERSION;
  out.set(salt, 5);
  out.set(iv, 21);
  out.set(cipher, HEADER);
  return out;
}

/** The salt stored in a sync file (needed to derive the key on a new device). */
export function saltOf(file: Uint8Array): Uint8Array {
  checkHeader(file);
  return file.slice(5, 21);
}

function checkHeader(file: Uint8Array) {
  if (file.length < HEADER || new TextDecoder().decode(file.slice(0, 4)) !== MAGIC) throw new Error('This is not a Nihongo sync file.');
  if (file[4] !== VERSION) throw new Error('This sync file was made by a newer version of the app – update it first.');
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong sync password.');
  }
}

export async function decryptJson<T>(file: Uint8Array, key: CryptoKey): Promise<T> {
  checkHeader(file);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.slice(21, 33) }, key, file.slice(HEADER));
  } catch {
    throw new WrongPasswordError();
  }
  const json = await pipe(new Uint8Array(plain), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(json)) as T;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
