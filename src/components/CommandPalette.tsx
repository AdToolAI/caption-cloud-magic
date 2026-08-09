import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import * as LucideIcons from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { tx } from '@/lib/i18nText';

interface Command {
  id: string;
  label: string;
  icon: string;
  route: string;
  category: string;
  keywords: string[];
}

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();

  const commands: Command[] = [
    // Create
    { id: "generator", label: t("nav.textStudio"), icon: "Sparkles", route: "/ai-text-studio", category: "create", keywords: ["caption", "generate", tx({ de: "erstellen", en: "create", es: "crear" }), "text", "studio", "prompt"] },
    
    { id: "rewriter", label: t("nav.rewriter"), icon: "RefreshCw", route: "/rewriter", category: "create", keywords: ["rewrite", tx({ de: "umschreiben", en: "rewrite", es: "reescribir" }), tx({ de: "verbessern", en: "improve", es: "mejorar" })] },
    { id: "carousel", label: "Carousel Generator", icon: "LayoutGrid", route: "/carousel", category: "create", keywords: ["carousel", "slides", tx({ de: "präsentation", en: "presentation", es: "presentación" })] },
    
    
    // Optimize
    { id: "wizard", label: t("nav.wizard"), icon: "Wand2", route: "/wizard", category: "optimize", keywords: ["prompt", "optimize", tx({ de: "optimieren", en: "optimize", es: "optimizar" })] },
    { id: "advisor", label: t("nav.advisor"), icon: "Clock", route: "/post-time-advisor", category: "optimize", keywords: ["time", tx({ de: "zeit", en: "time", es: "tiempo" }), "schedule"] },
    { id: "calendar", label: "Calendar", icon: "Calendar", route: "/command-center?view=calendar", category: "optimize", keywords: ["calendar", tx({ de: "kalender", en: "calendar", es: "calendario" }), tx({ de: "planen", en: "plan", es: "planificar" })] },
    
    // Analyze
    { id: "performance", label: t("nav.performance"), icon: "TrendingUp", route: "/performance", category: "analyze", keywords: ["performance", "analytics", tx({ de: "statistik", en: "statistics", es: "estadísticas" })] },
    { id: "goals", label: t("nav.goals"), icon: "Target", route: "/goals", category: "analyze", keywords: ["goals", tx({ de: "ziele", en: "goals", es: "objetivos" }), "tracking"] },
    
    
    // Design
    { id: "image-caption", label: "Image Caption", icon: "Image", route: "/image-caption", category: "design", keywords: ["image", tx({ de: "bild", en: "image", es: "imagen" }), "foto"] },
    { id: "bio", label: "Bio Optimizer", icon: "User", route: "/bio-optimizer", category: "design", keywords: ["bio", "profile", "profil"] },
    { id: "brandkit", label: "Brand Kit", icon: "Palette", route: "/brand-kit", category: "design", keywords: ["brand", tx({ de: "marke", en: "brand", es: "marca" }), "design"] },
    
    // Other
    { id: "account", label: t("nav.account"), icon: "Settings", route: "/account", category: "other", keywords: ["account", "settings", tx({ de: "einstellungen", en: "settings", es: "ajustes" })] },
    { id: "pricing", label: t("nav.pricing"), icon: "CreditCard", route: "/pricing", category: "other", keywords: ["pricing", tx({ de: "preise", en: "prices", es: "precios" }), "upgrade"] },
  ];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const getIconComponent = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Sparkles;
  };

  const handleSelect = (route: string) => {
    setOpen(false);
    navigate(route);
  };

  const groupedCommands = {
    create: commands.filter(c => c.category === "create"),
    optimize: commands.filter(c => c.category === "optimize"),
    analyze: commands.filter(c => c.category === "analyze"),
    design: commands.filter(c => c.category === "design"),
    other: commands.filter(c => c.category === "other"),
  };

  if (!user) return null;

  return (
    <>
      {/* Keyboard hint */}
      <div className="fixed bottom-4 right-4 z-50 hidden md:block">
        <kbd className="pointer-events-none inline-flex h-8 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs font-medium text-muted-foreground opacity-100 hover:opacity-100 transition-opacity">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("commandPalette.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("commandPalette.noResults")}</CommandEmpty>
          
          <CommandGroup heading={t("category.create")}>
            {groupedCommands.create.map((command) => {
              const Icon = getIconComponent(command.icon);
              return (
                <CommandItem
                  key={command.id}
                  onSelect={() => handleSelect(command.route)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{command.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("category.optimize")}>
            {groupedCommands.optimize.map((command) => {
              const Icon = getIconComponent(command.icon);
              return (
                <CommandItem
                  key={command.id}
                  onSelect={() => handleSelect(command.route)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{command.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("category.analyze")}>
            {groupedCommands.analyze.map((command) => {
              const Icon = getIconComponent(command.icon);
              return (
                <CommandItem
                  key={command.id}
                  onSelect={() => handleSelect(command.route)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{command.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("category.design")}>
            {groupedCommands.design.map((command) => {
              const Icon = getIconComponent(command.icon);
              return (
                <CommandItem
                  key={command.id}
                  onSelect={() => handleSelect(command.route)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{command.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
