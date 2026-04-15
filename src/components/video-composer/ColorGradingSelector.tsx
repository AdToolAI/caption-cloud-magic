import type { ColorGradingPreset } from '@/types/video-composer';

interface ColorGradingSelectorProps {
  value: ColorGradingPreset;
  onChange: (preset: ColorGradingPreset) => void;
}

const PRESETS: { id: ColorGradingPreset; label: string; gradient: string }[] = [
  { id: 'none', label: 'Original', gradient: 'from-gray-700 to-gray-900' },
  { id: 'cinematic-warm', label: 'Cinematic Warm', gradient: 'from-orange-900 to-amber-800' },
  { id: 'cool-blue', label: 'Cool Blue', gradient: 'from-blue-900 to-cyan-800' },
  { id: 'vintage-film', label: 'Vintage Film', gradient: 'from-yellow-900/80 to-stone-800' },
  { id: 'high-contrast', label: 'High Contrast', gradient: 'from-gray-950 to-gray-700' },
  { id: 'moody-dark', label: 'Moody Dark', gradient: 'from-slate-950 to-indigo-950' },
];

export default function ColorGradingSelector({ value, onChange }: ColorGradingSelectorProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onChange(preset.id)}
          className={`group flex flex-col items-center gap-1.5 transition-all ${
            value === preset.id ? 'scale-105' : 'opacity-60 hover:opacity-90'
          }`}
        >
          <div
            className={`w-full aspect-video rounded-lg bg-gradient-to-br ${preset.gradient} border-2 transition-all ${
              value === preset.id ? 'border-primary shadow-lg shadow-primary/20' : 'border-transparent'
            }`}
          />
          <span className={`text-[10px] ${value === preset.id ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            {preset.label}
          </span>
        </button>
      ))}
    </div>
  );
}
