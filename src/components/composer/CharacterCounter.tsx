import { Progress } from "@/components/ui/progress";
import type { Provider } from "@/types/publish";

interface CharacterCounterProps {
  text: string;
  channels: Provider[];
}

export function CharacterCounter({ text, channels }: CharacterCounterProps) {
  const limits: Record<Provider, number> = {
    x: 280,
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
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Progress value={Math.min(percentage, 100)} className="h-2" />
      </div>
      <span className={`text-sm font-mono font-medium ${color} min-w-[80px] text-right`}>
        {text.length}/{activeLimit}
      </span>
    </div>
  );
}
