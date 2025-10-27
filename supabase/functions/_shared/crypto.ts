// AES-GCM Encryption/Decryption for sensitive tokens
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALGORITHM = 'AES-GCM';

// Supabase Admin Client für Vault-Zugriff
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

async function getEncryptionKey(): Promise<CryptoKey> {
  // Secret aus Supabase Vault lesen (persistent über alle Deployments!)
  const { data: secretData, error } = await supabaseAdmin
    .from('vault.decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', 'ENCRYPTION_SECRET')
    .maybeSingle();

  if (error) {
    console.error('[crypto] Error fetching ENCRYPTION_SECRET from vault:', error);
    throw new Error('Failed to fetch ENCRYPTION_SECRET from vault');
  }

  if (!secretData?.decrypted_secret) {
    console.error('[crypto] ENCRYPTION_SECRET not found in vault');
    throw new Error('ENCRYPTION_SECRET not found in vault');
  }

  const secret = secretData.decrypted_secret;
  if (secret.length !== 32) {
    console.error('[crypto] ENCRYPTION_SECRET must be exactly 32 characters, got:', secret.length);
    throw new Error('ENCRYPTION_SECRET must be exactly 32 characters');
  }

  console.log('[crypto] ✅ ENCRYPTION_SECRET retrieved from vault successfully');
  
  const keyMaterial = new TextEncoder().encode(secret);
  return await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );
  
  // Combine IV + Ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}
