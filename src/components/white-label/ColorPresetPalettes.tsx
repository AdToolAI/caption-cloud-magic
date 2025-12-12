import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface ColorPreset {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

const presets: ColorPreset[] = [
  { name: 'Professional', primary: '#6366f1', secondary: '#8b5cf6', accent: '#06b6d4' },
  { name: 'Modern', primary: '#3b82f6', secondary: '#1d4ed8', accent: '#f59e0b' },
  { name: 'Bold', primary: '#ef4444', secondary: '#dc2626', accent: '#fbbf24' },
  { name: 'Nature', primary: '#22c55e', secondary: '#16a34a', accent: '#84cc16' },
  { name: 'Elegant', primary: '#f5c76a', secondary: '#d4a853', accent: '#a855f7' },
  { name: 'Dark', primary: '#64748b', secondary: '#475569', accent: '#22d3ee' },
];

interface ColorPresetPalettesProps {
  onSelect: (preset: ColorPreset) => void;
  currentColors: { primary: string; secondary: string; accent: string };
}

export const ColorPresetPalettes = ({ onSelect, currentColors }: ColorPresetPalettesProps) => {
  const isSelected = (preset: ColorPreset) => 
    preset.primary.toLowerCase() === currentColors.primary.toLowerCase() &&
    preset.secondary.toLowerCase() === currentColors.secondary.toLowerCase() &&
    preset.accent.toLowerCase() === currentColors.accent.toLowerCase();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {presets.map((preset, index) => (
        <motion.button
          key={preset.name}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(preset)}
          className={`relative p-4 rounded-xl bg-card/40 backdrop-blur-sm border transition-all ${
            isSelected(preset) 
              ? 'border-primary ring-2 ring-primary/30' 
              : 'border-white/10 hover:border-white/20'
          }`}
        >
          {isSelected(preset) && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 right-2 p-1 rounded-full bg-primary"
            >
              <Check className="w-3 h-3 text-primary-foreground" />
            </motion.div>
          )}
          
          <div className="flex gap-1.5 mb-3">
            <div 
              className="w-8 h-8 rounded-lg shadow-lg" 
              style={{ backgroundColor: preset.primary }}
            />
            <div 
              className="w-8 h-8 rounded-lg shadow-lg" 
              style={{ backgroundColor: preset.secondary }}
            />
            <div 
              className="w-8 h-8 rounded-lg shadow-lg" 
              style={{ backgroundColor: preset.accent }}
            />
          </div>
          
          <span className="text-sm font-medium">{preset.name}</span>
        </motion.button>
      ))}
    </div>
  );
};
