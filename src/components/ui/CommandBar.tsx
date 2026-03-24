import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Search,
  Sparkles,
  Edit3,
  Clock,
  Wand2,
  
  Zap,
  RefreshCw,
  MessageSquare,
  User,
  MessageCircle,
  TrendingUp,
  BarChart3,
  Target,
  Workflow,
  Share2,
  Settings,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface CommandBarProps {
  inline?: boolean;
}

export function CommandBar({ inline = false }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation();

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

  const routes = [
    // Planen
    { name: t("nav.calendar"), path: "/calendar", icon: Calendar, category: t("hubs.planen") },
    { name: t("nav.composer"), path: "/composer", icon: Edit3, category: t("hubs.planen") },
    { name: t("nav.postTimeAdvisor"), path: "/post-time-advisor", icon: Clock, category: t("hubs.planen") },
    
    // Erstellen
    { name: t("nav.textStudio"), path: "/generator", icon: Sparkles, category: t("hubs.erstellen") },
    
    { name: t("nav.hookGenerator"), path: "/hook-generator", icon: Zap, category: t("hubs.erstellen") },
    
    // Optimieren
    { name: t("nav.rewriter"), path: "/rewriter", icon: RefreshCw, category: t("hubs.optimieren") },
    { name: t("nav.coach"), path: "/coach", icon: MessageSquare, category: t("hubs.optimieren") },
    { name: t("nav.bioOptimizer"), path: "/bio", icon: User, category: t("hubs.optimieren") },
    { name: t("nav.commentManager"), path: "/comment-manager", icon: MessageCircle, category: t("hubs.optimieren") },
    
    // Analysieren
    { name: t("nav.performance"), path: "/performance", icon: TrendingUp, category: t("hubs.analysieren") },
    { name: t("nav.analytics"), path: "/analytics", icon: BarChart3, category: t("hubs.analysieren") },
    { name: t("nav.goals"), path: "/goals", icon: Target, category: t("hubs.analysieren") },
    
    // Automatisieren
    { name: t("nav.campaigns"), path: "/campaigns", icon: Workflow, category: t("hubs.automatisieren") },
    { name: t("nav.integrations"), path: "/instagram-publishing", icon: Share2, category: t("hubs.automatisieren") },
    
    // Andere
    { name: t("header.account"), path: "/account", icon: Settings, category: t("commandBar.other") },
  ];

  const filteredRoutes = query
    ? routes.filter((route) =>
        route.name.toLowerCase().includes(query.toLowerCase()) ||
        route.category.toLowerCase().includes(query.toLowerCase())
      )
    : routes;

  const groupedRoutes = filteredRoutes.reduce((acc, route) => {
    const category = route.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(route);
    return acc;
  }, {} as Record<string, typeof routes>);

  if (inline) {
    return (
      <>
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("commandBar.placeholder")}
            onClick={() => setOpen(true)}
            readOnly
            className="w-full pl-9 pr-20 rounded-xl bg-muted/50 border-muted focus-visible:ring-primary cursor-pointer"
          />
          <kbd className="absolute right-3 top-2 pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="p-0 gap-0 max-w-2xl">
            <Command className="rounded-2xl border shadow-glow">
              <CommandInput 
                placeholder={t("commandBar.searchPlaceholder")}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-[400px]">
                <CommandEmpty>{t("commandBar.noResults")}</CommandEmpty>
                {Object.entries(groupedRoutes).map(([category, items]) => (
                  <CommandGroup key={category} heading={category}>
                    {items.map((route) => (
                      <CommandItem
                        key={route.path}
                        onSelect={() => {
                          navigate(route.path);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="cursor-pointer"
                      >
                        <route.icon className="mr-2 h-4 w-4" />
                        <span>{route.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
            <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
              {t("commandBar.hint")}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-2xl">
        <Command className="rounded-2xl border shadow-glow">
          <CommandInput 
            placeholder={t("commandBar.searchPlaceholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>{t("commandBar.noResults")}</CommandEmpty>
            {Object.entries(groupedRoutes).map(([category, items]) => (
              <CommandGroup key={category} heading={category}>
                {items.map((route) => (
                  <CommandItem
                    key={route.path}
                    onSelect={() => {
                      navigate(route.path);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="cursor-pointer"
                  >
                    <route.icon className="mr-2 h-4 w-4" />
                    <span>{route.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
          {t("commandBar.hint")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
