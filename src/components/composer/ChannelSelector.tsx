import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook, Twitter, Linkedin, Youtube } from "lucide-react";
import type { Provider } from "@/types/publish";
import { cn } from "@/lib/utils";

interface ChannelSelectorProps {
  selectedChannels: Provider[];
  onChannelsChange: (channels: Provider[]) => void;
}

const channels: Array<{ id: Provider; name: string; icon: React.ElementType }> = [
  { id: "instagram", name: "Instagram", icon: Instagram },
  { id: "facebook", name: "Facebook", icon: Facebook },
  { id: "x", name: "X (Twitter)", icon: Twitter },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin },
  { id: "tiktok", name: "TikTok", icon: () => <span className="text-sm font-bold">TT</span> },
  { id: "youtube", name: "YouTube", icon: Youtube },
];

export function ChannelSelector({ selectedChannels, onChannelsChange }: ChannelSelectorProps) {
  const toggleChannel = (channelId: Provider) => {
    if (selectedChannels.includes(channelId)) {
      onChannelsChange(selectedChannels.filter((c) => c !== channelId));
    } else {
      onChannelsChange([...selectedChannels, channelId]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Target Channels</label>
      <div className="flex flex-wrap gap-2">
        {channels.map((channel) => {
          const isSelected = selectedChannels.includes(channel.id);
          const Icon = channel.icon;

          return (
            <Badge
              key={channel.id}
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm transition-all hover:scale-105",
                isSelected && "shadow-md"
              )}
              onClick={() => toggleChannel(channel.id)}
            >
              <Icon className="h-4 w-4 mr-1.5" />
              {channel.name}
            </Badge>
          );
        })}
      </div>
      {selectedChannels.length === 0 && (
        <p className="text-xs text-destructive">Select at least one channel</p>
      )}
    </div>
  );
}
