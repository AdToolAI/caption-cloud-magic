// License mapping: maps a source provider to its public license terms reference.
// We REFERENCE the provider's license; we do not invent license language.
// Pattern follows Envato/Storyblocks where the certificate links back to
// the source's published license.

export type LicenseTier = 'personal' | 'commercial' | 'pro';

export interface ProviderLicenseInfo {
  provider_license_name: string;
  provider_license_url: string;
  permitted_uses: string[];
  restrictions: string[];
  attribution_required: boolean;
  default_tier: LicenseTier;
}

const COMMON_USES = [
  'Web & social media',
  'Paid advertising',
  'Client deliverables',
  'Broadcast & streaming',
];

const COMMON_RESTRICTIONS = [
  'Resale as standalone asset',
  'Use in trademarks or logos',
];

export const LICENSE_MAPPING: Record<string, ProviderLicenseInfo> = {
  // Stock providers
  pixabay: {
    provider_license_name: 'Pixabay Content License',
    provider_license_url: 'https://pixabay.com/service/license-summary/',
    permitted_uses: COMMON_USES,
    restrictions: [...COMMON_RESTRICTIONS, 'Imply endorsement by depicted persons'],
    attribution_required: false,
    default_tier: 'commercial',
  },
  pexels: {
    provider_license_name: 'Pexels License',
    provider_license_url: 'https://www.pexels.com/license/',
    permitted_uses: COMMON_USES,
    restrictions: [...COMMON_RESTRICTIONS, 'Imply endorsement by depicted persons'],
    attribution_required: false,
    default_tier: 'commercial',
  },
  freesound: {
    provider_license_name: 'Creative Commons (per-clip; see source URL)',
    provider_license_url: 'https://freesound.org/help/faq/#licenses',
    permitted_uses: COMMON_USES,
    restrictions: COMMON_RESTRICTIONS,
    attribution_required: true,
    default_tier: 'commercial',
  },

  // AI generators (Replicate-hosted)
  'replicate-music': {
    provider_license_name: 'Replicate Output Terms (Music)',
    provider_license_url: 'https://replicate.com/terms',
    permitted_uses: COMMON_USES,
    restrictions: [...COMMON_RESTRICTIONS, 'Resale of model weights'],
    attribution_required: false,
    default_tier: 'commercial',
  },
  'replicate-video': {
    provider_license_name: 'Replicate Output Terms (Video)',
    provider_license_url: 'https://replicate.com/terms',
    permitted_uses: COMMON_USES,
    restrictions: [...COMMON_RESTRICTIONS, 'Resale of model weights'],
    attribution_required: false,
    default_tier: 'commercial',
  },
  'replicate-image': {
    provider_license_name: 'Replicate Output Terms (Image)',
    provider_license_url: 'https://replicate.com/terms',
    permitted_uses: COMMON_USES,
    restrictions: [...COMMON_RESTRICTIONS, 'Resale of model weights'],
    attribution_required: false,
    default_tier: 'commercial',
  },
  heygen: {
    provider_license_name: 'HeyGen Commercial Use Policy',
    provider_license_url: 'https://www.heygen.com/policy',
    permitted_uses: COMMON_USES,
    restrictions: [
      ...COMMON_RESTRICTIONS,
      'Impersonation without consent',
      'Political content without disclosure',
    ],
    attribution_required: false,
    default_tier: 'commercial',
  },
  elevenlabs: {
    provider_license_name: 'ElevenLabs Commercial License',
    provider_license_url: 'https://elevenlabs.io/terms',
    permitted_uses: COMMON_USES,
    restrictions: [...COMMON_RESTRICTIONS, 'Voice cloning without consent'],
    attribution_required: false,
    default_tier: 'commercial',
  },
  runway: {
    provider_license_name: 'Runway Output Terms',
    provider_license_url: 'https://runwayml.com/terms-of-use',
    permitted_uses: COMMON_USES,
    restrictions: COMMON_RESTRICTIONS,
    attribution_required: false,
    default_tier: 'commercial',
  },

  // Lovable-native
  'lovable-ai': {
    provider_license_name: 'Lovable AI Output License',
    provider_license_url: 'https://lovable.dev/terms',
    permitted_uses: COMMON_USES,
    restrictions: COMMON_RESTRICTIONS,
    attribution_required: false,
    default_tier: 'commercial',
  },
  marketplace: {
    provider_license_name: 'Lovable Marketplace Buyer License',
    provider_license_url: 'https://lovable.dev/terms',
    permitted_uses: COMMON_USES,
    restrictions: [
      ...COMMON_RESTRICTIONS,
      'Sub-licensing to third parties',
      'Use beyond purchased seat count',
    ],
    attribution_required: false,
    default_tier: 'commercial',
  },
};

export function resolveLicenseInfo(provider: string): ProviderLicenseInfo {
  return LICENSE_MAPPING[provider] ?? LICENSE_MAPPING['lovable-ai'];
}

export function generateCertificateNumber(): string {
  // LVB-YYYY-XXXXXX (alphanumeric uppercase, no ambiguous chars)
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `LVB-${year}-${suffix}`;
}

export function generateVerifyToken(): string {
  // 32-char URL-safe random token
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
