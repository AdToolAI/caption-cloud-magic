import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube } from "lucide-react";

const platformConfig = {
  instagram: { icon: Instagram, color: 'text-pink-500', name: 'Instagram' },
  tiktok: { icon: Music, color: 'text-foreground', name: 'TikTok' },
  linkedin: { icon: Linkedin, color: 'text-blue-700 dark:text-blue-500', name: 'LinkedIn' },
  facebook: { icon: Facebook, color: 'text-blue-600 dark:text-blue-500', name: 'Facebook' },
  x: { icon: Twitter, color: 'text-foreground', name: 'X' },
  youtube: { icon: Youtube, color: 'text-red-600', name: 'YouTube' },
};

const aliases: Record<string, string> = { twitter: 'x' };

interface PlatformBadgeProps {
  platform: string;
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const key = aliases[platform.toLowerCase()] || platform.toLowerCase();
  const config = platformConfig[key as keyof typeof platformConfig];

  if (!config) return null;

  const { icon: Icon, color, name } = config;

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="text-xs font-medium">{name}</span>
    </div>
  );
}
