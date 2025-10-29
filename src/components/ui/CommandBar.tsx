import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "./dialog";
import { Search, Calendar, Sparkles, LineChart, Palette, Users } from "lucide-react";

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
    { name: "Intelligenter Kalender", path: "/calendar", icon: Calendar },
    { name: "AI Post Generator", path: "/generator", icon: Sparkles },
    { name: "Composer", path: "/composer", icon: Sparkles },
    { name: "Analytics", path: "/analytics", icon: LineChart },
    { name: "Brand Kit", path: "/brand-kit", icon: Palette },
    { name: "Team Workspace", path: "/team", icon: Users },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl overflow-hidden">
        <Command className="rounded-2xl border-0">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <Command.Input
              placeholder="Suche nach Features..."
              className="flex-1 py-3 outline-none bg-transparent text-sm placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Keine Ergebnisse gefunden.
            </Command.Empty>
            <Command.Group heading="Navigation" className="p-2">
              {routes.map((route) => {
                const Icon = route.icon;
                return (
                  <Command.Item
                    key={route.path}
                    onSelect={() => {
                      navigate(route.path);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-smooth data-[selected=true]:bg-muted/50"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm">{route.name}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            Tipp: Drücke <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">⌘K</kbd> zum Öffnen
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
