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
    { id: "generator", label: t("nav.generator"), icon: "Sparkles", route: "/generator", category: "create", keywords: ["caption", "generate", "erstellen"] },
    { id: "hooks", label: t("nav.hookGenerator"), icon: "Zap", route: "/hook-generator", category: "create", keywords: ["hook", "opener", "einstieg"] },
    { id: "rewriter", label: t("nav.rewriter"), icon: "RefreshCw", route: "/rewriter", category: "create", keywords: ["rewrite", "umschreiben", "verbessern"] },
    { id: "carousel", label: "Carousel Generator", icon: "LayoutGrid", route: "/carousel", category: "create", keywords: ["carousel", "slides", "präsentation"] },
    { id: "reel", label: "Reel Script", icon: "Video", route: "/reel-script", category: "create", keywords: ["reel", "script", "video"] },
    
    // Optimize
    { id: "wizard", label: t("nav.wizard"), icon: "Wand2", route: "/wizard", category: "optimize", keywords: ["prompt", "optimize", "optimieren"] },
    { id: "advisor", label: t("nav.advisor"), icon: "Clock", route: "/post-time-advisor", category: "optimize", keywords: ["time", "zeit", "schedule"] },
    { id: "calendar", label: "Calendar", icon: "Calendar", route: "/calendar", category: "optimize", keywords: ["calendar", "kalender", "planen"] },
    
    // Analyze
    { id: "performance", label: t("nav.performance"), icon: "TrendingUp", route: "/performance", category: "analyze", keywords: ["performance", "analytics", "statistik"] },
    { id: "goals", label: t("nav.goals"), icon: "Target", route: "/goals", category: "analyze", keywords: ["goals", "ziele", "tracking"] },
    { id: "audit", label: "Content Audit", icon: "Search", route: "/audit", category: "analyze", keywords: ["audit", "analyse", "review"] },
    
    // Design
    { id: "image-caption", label: "Image Caption", icon: "Image", route: "/image-caption", category: "design", keywords: ["image", "bild", "foto"] },
    { id: "bio", label: "Bio Optimizer", icon: "User", route: "/bio-optimizer", category: "design", keywords: ["bio", "profile", "profil"] },
    { id: "brandkit", label: "Brand Kit", icon: "Palette", route: "/brand-kit", category: "design", keywords: ["brand", "marke", "design"] },
    
    // Other
    { id: "account", label: t("nav.account"), icon: "Settings", route: "/account", category: "other", keywords: ["account", "settings", "einstellungen"] },
    { id: "pricing", label: t("nav.pricing"), icon: "CreditCard", route: "/pricing", category: "other", keywords: ["pricing", "preise", "upgrade"] },
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
