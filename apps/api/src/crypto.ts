// AES-GCM encryption for gateway credentials. Key = base64 32 bytes in the CREDENTIALS_KEY Worker secret
// (generate: openssl rand -base64 32). AAD binds a ciphertext to one store+provider.
const b64e = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const b64d = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const importKey = (secret: string) => {
  const raw = b64d(secret);
  if (raw.length !== 32) throw new Error("CREDENTIALS_KEY must be 32 bytes, base64 encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export async function encryptJson(secret: string, value: unknown, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    await importKey(secret), new TextEncoder().encode(JSON.stringify(value)));
  return `${b64e(iv)}.${b64e(new Uint8Array(ct))}`;
}

export async function decryptJson<T>(secret: string, payload: string, aad: string): Promise<T> {
  const [iv, ct] = payload.split(".");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64d(iv), additionalData: new TextEncoder().encode(aad) },
    await importKey(secret), b64d(ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
