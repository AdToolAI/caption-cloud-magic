// Web Push encryption (RFC 8291) and VAPID auth (RFC 8292)
// Using Deno's SubtleCrypto API - zero dependencies

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function importVapidKeys(publicKeyB64: string, privateKeyB64: string) {
  const publicKeyRaw = base64UrlDecode(publicKeyB64);
  const privateKeyRaw = base64UrlDecode(privateKeyB64);

  // Import public key
  const publicKey = await crypto.subtle.importKey(
    "raw",
    publicKeyRaw,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    []
  );

  // Import private key as JWK (raw private keys need JWK conversion)
  // P-256 uncompressed public key: 04 || x (32 bytes) || y (32 bytes)
  const x = base64UrlEncode(publicKeyRaw.slice(1, 33));
  const y = base64UrlEncode(publicKeyRaw.slice(33, 65));
  const d = base64UrlEncode(privateKeyRaw);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );

  return { publicKey, privateKey, publicKeyRaw };
}

async function createVapidJwt(
  endpoint: string,
  publicKeyRaw: Uint8Array,
  privateKey: CryptoKey,
  subject: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub: subject };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format (each 32 bytes)
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;

  if (sigBytes[0] === 0x30) {
    // DER encoded - parse it
    const rLen = sigBytes[3];
    const rStart = 4;
    const rBytes = sigBytes.slice(rStart, rStart + rLen);
    const sLen = sigBytes[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    const sBytes = sigBytes.slice(sStart, sStart + sLen);

    // Pad/trim to 32 bytes
    r = new Uint8Array(32);
    s = new Uint8Array(32);
    r.set(rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes, 32 - Math.min(rBytes.length, 32));
    s.set(sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes, 32 - Math.min(sBytes.length, 32));
  } else {
    // Already raw format (64 bytes)
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  const sigB64 = base64UrlEncode(rawSig);
  const token = `${unsignedToken}.${sigB64}`;
  const publicKeyB64 = base64UrlEncode(publicKeyRaw);

  return {
    authorization: `vapid t=${token},k=${publicKeyB64}`,
    cryptoKey: `p256ecdsa=${publicKeyB64}`,
  };
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, salt.length ? salt : new Uint8Array(32)));

  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;

  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return okm.slice(0, length);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);

  // "Content-Encoding: <type>\0" + "P-256\0" + len(clientPublic) + clientPublic + len(serverPublic) + serverPublic
  const info = new Uint8Array(
    18 + typeBytes.length + 1 + 5 + 1 + 2 + clientPublicKey.length + 2 + serverPublicKey.length
  );
  let offset = 0;

  const cePrefix = encoder.encode("Content-Encoding: ");
  info.set(cePrefix, offset);
  offset += cePrefix.length;
  info.set(typeBytes, offset);
  offset += typeBytes.length;
  info[offset++] = 0; // null separator

  const p256 = encoder.encode("P-256");
  info.set(p256, offset);
  offset += p256.length;
  info[offset++] = 0;

  info[offset++] = 0;
  info[offset++] = clientPublicKey.length;
  info.set(clientPublicKey, offset);
  offset += clientPublicKey.length;

  info[offset++] = 0;
  info[offset++] = serverPublicKey.length;
  info.set(serverPublicKey, offset);

  return info;
}

async function encryptPayload(
  clientPublicKeyB64: string,
  clientAuthB64: string,
  payload: string
): Promise<{ encrypted: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
  const clientPublicKeyRaw = base64UrlDecode(clientPublicKeyB64);
  const clientAuth = base64UrlDecode(clientAuthB64);

  // Generate ephemeral ECDH key pair for this message
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import client's public key for ECDH
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeys.privateKey,
      256
    )
  );

  // Export server public key
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey)
  );

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM = HKDF(auth, sharedSecret, auth_info)
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const ikm = await hkdf(clientAuth, sharedSecret, authInfo, 32);

  // Content encryption key
  const cekInfo = createInfo("aesgcm", clientPublicKeyRaw, serverPublicKeyRaw);
  const contentEncryptionKey = await hkdf(salt, ikm, cekInfo, 16);

  // Nonce
  const nonceInfo = createInfo("nonce", clientPublicKeyRaw, serverPublicKeyRaw);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Pad payload (2 bytes padding length + padding + payload)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddingLength = 0;
  const padded = new Uint8Array(2 + paddingLength + payloadBytes.length);
  padded[0] = (paddingLength >> 8) & 0xff;
  padded[1] = paddingLength & 0xff;
  padded.set(payloadBytes, 2 + paddingLength);

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      padded
    )
  );

  return { encrypted, serverPublicKey: serverPublicKeyRaw, salt };
}

export async function sendWebPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
): Promise<Response> {
  // Import VAPID keys
  const { publicKeyRaw, privateKey } = await importVapidKeys(vapidPublicKey, vapidPrivateKey);

  // Create VAPID authorization
  const vapidHeaders = await createVapidJwt(
    subscription.endpoint,
    publicKeyRaw,
    privateKey,
    subject
  );

  // Encrypt payload
  const { encrypted, serverPublicKey, salt } = await encryptPayload(
    subscription.keys.p256dh,
    subscription.keys.auth,
    payload
  );

  // Send push message
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeaders.authorization,
      "Crypto-Key": vapidHeaders.cryptoKey + `;dh=${base64UrlEncode(serverPublicKey)}`,
      "Content-Encoding": "aesgcm",
      Encryption: `salt=${base64UrlEncode(salt)}`,
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body: encrypted,
  });

  return response;
}
