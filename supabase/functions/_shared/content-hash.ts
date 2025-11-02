/**
 * Content Hash Generator for Exactly-Once Guarantees
 * Used to prevent duplicate posts
 */

/**
 * Generate SHA-256 hash of content for deduplication
 */
export async function generateContentHash(
  caption: string,
  mediaUrls: string[]
): Promise<string> {
  const content = caption + mediaUrls.sort().join(',');
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
