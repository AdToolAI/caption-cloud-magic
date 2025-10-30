import { Instagram, Music, Linkedin, Facebook, Twitter } from "lucide-react";

interface PlatformBadgeProps {
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'x' | 'twitter';
}

const platformConfig = {
  instagram: { icon: Instagram, color: 'text-pink-500', name: 'Instagram' },
  tiktok: { icon: Music, color: 'text-foreground', name: 'TikTok' },
  linkedin: { icon: Linkedin, color: 'text-blue-700 dark:text-blue-500', name: 'LinkedIn' },
  facebook: { icon: Facebook, color: 'text-blue-600 dark:text-blue-500', name: 'Facebook' },
  x: { icon: Twitter, color: 'text-foreground', name: 'X' },
  twitter: { icon: Twitter, color: 'text-foreground', name: 'X' },
};

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const normalizedPlatform = platform === 'twitter' ? 'x' : platform;
  const { icon: Icon, color, name } = platformConfig[normalizedPlatform];
  
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="text-xs font-medium">{name}</span>
    </div>
  );
}
