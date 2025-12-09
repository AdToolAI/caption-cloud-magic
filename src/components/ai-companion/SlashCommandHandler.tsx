import React from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  RefreshCcw, 
  CreditCard, 
  HelpCircle, 
  Settings,
  Video,
  Calendar,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'status' | 'action' | 'help';
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: '/status',
    label: 'Account Status',
    description: 'Zeigt vollständige Account-Übersicht',
    icon: <BarChart3 className="w-4 h-4" />,
    category: 'status'
  },
  {
    command: '/credits',
    label: 'Credits anzeigen',
    description: 'Zeigt deine Credit-Balance',
    icon: <CreditCard className="w-4 h-4" />,
    category: 'status'
  },
  {
    command: '/render',
    label: 'Render-Status',
    description: 'Zeigt aktive Video-Renderings',
    icon: <Video className="w-4 h-4" />,
    category: 'status'
  },
  {
    command: '/reconnect',
    label: 'Reconnect Platform',
    description: 'Erneuert Social Media Verbindung',
    icon: <RefreshCcw className="w-4 h-4" />,
    category: 'action'
  },
  {
    command: '/calendar',
    label: 'Kalender-Übersicht',
    description: 'Zeigt geplante Posts diese Woche',
    icon: <Calendar className="w-4 h-4" />,
    category: 'status'
  },
  {
    command: '/tips',
    label: 'Tipps anzeigen',
    description: 'Zeigt personalisierte Tipps',
    icon: <Sparkles className="w-4 h-4" />,
    category: 'help'
  },
  {
    command: '/settings',
    label: 'Einstellungen',
    description: 'Öffnet Account-Einstellungen',
    icon: <Settings className="w-4 h-4" />,
    category: 'action'
  },
  {
    command: '/help',
    label: 'Hilfe',
    description: 'Zeigt alle verfügbaren Befehle',
    icon: <HelpCircle className="w-4 h-4" />,
    category: 'help'
  }
];

interface SlashCommandSuggestionsProps {
  input: string;
  onSelect: (command: string) => void;
  visible: boolean;
}

export function SlashCommandSuggestions({ input, onSelect, visible }: SlashCommandSuggestionsProps) {
  if (!visible || !input.startsWith('/')) return null;

  const searchTerm = input.toLowerCase();
  const filteredCommands = SLASH_COMMANDS.filter(cmd => 
    cmd.command.toLowerCase().startsWith(searchTerm) ||
    cmd.label.toLowerCase().includes(searchTerm.slice(1))
  );

  if (filteredCommands.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-full left-0 right-0 mb-2 bg-card/95 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden shadow-xl z-10"
    >
      <div className="p-2 border-b border-white/10 text-xs text-muted-foreground">
        Befehle
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {filteredCommands.map((cmd, index) => (
          <motion.button
            key={cmd.command}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => onSelect(cmd.command)}
            className={cn(
              "w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors",
              "border-b border-white/5 last:border-0"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              cmd.category === 'status' && "bg-primary/20 text-primary",
              cmd.category === 'action' && "bg-[hsl(45,93%,69%)]/20 text-[hsl(45,93%,69%)]",
              cmd.category === 'help' && "bg-cyan-500/20 text-cyan-400"
            )}>
              {cmd.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground">{cmd.command}</span>
                <span className="text-xs text-muted-foreground">{cmd.label}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

export function parseSlashCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args };
}

export function generateSlashCommandResponse(command: string, args: string[]): string | null {
  switch (command) {
    case '/help':
      return `📋 **Verfügbare Befehle:**

\`/status\` - Zeigt vollständige Account-Übersicht
\`/credits\` - Zeigt deine Credit-Balance
\`/render\` - Zeigt aktive Video-Renderings
\`/reconnect [platform]\` - Erneuert Social Media Verbindung
\`/calendar\` - Zeigt geplante Posts diese Woche
\`/tips\` - Zeigt personalisierte Tipps
\`/settings\` - Öffnet Account-Einstellungen
\`/help\` - Zeigt diese Hilfe

💡 **Tipp:** Du kannst auch einfach Fragen stellen, ich verstehe natürliche Sprache!`;

    case '/status':
      return '[COMMAND:status]'; // Will be processed specially

    case '/credits':
      return '[COMMAND:credits]';

    case '/render':
      return '[COMMAND:render]';

    case '/reconnect':
      if (args.length === 0) {
        return `Um eine Plattform neu zu verbinden, nutze:\n\n\`/reconnect instagram\`\n\`/reconnect youtube\`\n\`/reconnect tiktok\`\n\`/reconnect linkedin\`\n\`/reconnect x\`\n\nOder gehe direkt zu [Einstellungen](/settings/social-media).`;
      }
      const platform = args[0].toLowerCase();
      const validPlatforms = ['instagram', 'youtube', 'tiktok', 'linkedin', 'x', 'facebook'];
      if (validPlatforms.includes(platform)) {
        return `[ACTION:reconnect:${platform}]`;
      }
      return `Unbekannte Plattform: ${args[0]}. Verfügbare Plattformen: Instagram, YouTube, TikTok, LinkedIn, X, Facebook`;

    case '/calendar':
      return '[COMMAND:calendar]';

    case '/tips':
      return '[COMMAND:tips]';

    case '/settings':
      return '[ACTION:navigate:/settings]';

    default:
      return null;
  }
}
