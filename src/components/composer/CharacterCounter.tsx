import { Progress } from "@/components/ui/progress";
import type { Provider } from "@/types/publish";

interface CharacterCounterProps {
  text: string;
  channels: Provider[];
}

export function CharacterCounter({ text, channels }: CharacterCounterProps) {
  const limits: Record<Provider, number> = {
    x: 25000,
    instagram: 2200,
    linkedin: 3000,
    facebook: 5000,
    tiktok: 2200,
    youtube: 5000,
  };

  const activeLimit = channels.length > 0 ? Math.min(...channels.map((c) => limits[c])) : 5000;
  const percentage = (text.length / activeLimit) * 100;

  const color =
    percentage > 100
      ? "text-destructive"
      : percentage > 90
        ? "text-yellow-600"
        : "text-green-600";

  return (
    <div className="space-y-2">
      {channels.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Wählen Sie Channels aus, um Character Limits zu sehen
        </div>
      ) : (
        channels.map((channel) => {
          const limit = limits[channel];
          const percentage = (text.length / limit) * 100;
          const color =
            percentage > 100
              ? "text-destructive"
              : percentage > 90
                ? "text-yellow-600"
                : "text-green-600";
          
          return (
            <div key={channel} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium capitalize">{channel}</span>
                  <span className={`text-xs font-mono ${color}`}>
                    {text.length}/{limit}
                  </span>
                </div>
                <Progress value={Math.min(percentage, 100)} className="h-1.5" />
              </div>
              {percentage > 100 && (
                <span className="text-xs">⚠️</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
