import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Trash2, Copy, Download, Share2, Star, 
  MoreVertical, CheckCircle, Circle, Sparkles
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";

interface MultiBrandManagerProps {
  brandKits: any[];
  activeKitId: string | undefined;
  onSetActive: (id: string) => void;
  onDuplicate: (kit: any) => void;
  onDelete: (id: string) => void;
  onExport: (kit: any) => void;
}

export function MultiBrandManager({
  brandKits,
  activeKitId,
  onSetActive,
  onDuplicate,
  onDelete,
  onExport
}: MultiBrandManagerProps) {
  const { user } = useAuth();
  
  const handleDuplicate = (kit: any) => {
    trackEvent(ANALYTICS_EVENTS.BRAND_KIT_CREATED, {
      brand_name: kit.brand_name,
      source: 'duplicate',
      original_kit_id: kit.id,
      user_id: user?.id
    });
    onDuplicate(kit);
  };
  
  const handleDelete = (kitId: string) => {
    const kit = brandKits.find(k => k.id === kitId);
    if (kit) {
      trackEvent(ANALYTICS_EVENTS.BRAND_KIT_DELETED, {
        brand_name: kit.brand_name,
        kit_id: kit.id,
        user_id: user?.id
      });
    }
    onDelete(kitId);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Deine Marken-Sets</h3>
          <p className="text-sm text-muted-foreground">
            {brandKits.length} {brandKits.length === 1 ? 'Set' : 'Sets'} gespeichert
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brandKits.map((kit) => {
          const isActive = kit.id === activeKitId;
          
          return (
            <Card 
              key={kit.id} 
              className={`relative transition-all hover:shadow-lg ${
                isActive ? 'ring-2 ring-primary' : ''
              }`}
            >
              {isActive && (
                <div className="absolute -top-2 -right-2">
                  <Badge variant="default" className="shadow-lg">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Aktiv
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isActive ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      {kit.brand_name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(kit.created_at), 'dd. MMM yyyy', { locale: de })}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isActive && (
                        <DropdownMenuItem onClick={() => onSetActive(kit.id)}>
                          <Star className="mr-2 h-4 w-4" />
                          Als aktiv setzen
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDuplicate(kit)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplizieren
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExport(kit)}>
                        <Download className="mr-2 h-4 w-4" />
                        Als PDF exportieren
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(kit.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Color Preview */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Farbpalette</p>
                  <div className="flex gap-1">
                    <div 
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: kit.color_palette?.primary || kit.primary_color }}
                    />
                    <div 
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: kit.color_palette?.secondary || kit.secondary_color }}
                    />
                    <div 
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: kit.color_palette?.accent || '#6366F1' }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Konsistenz</p>
                    <p className="text-sm font-semibold">{kit.consistency_score || 0}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Version</p>
                    <p className="text-sm font-semibold">v{kit.version || 1}</p>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">{kit.mood}</Badge>
                  <Badge variant="outline" className="text-xs">{kit.brand_tone || kit.style_direction}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {brandKits.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Noch keine Marken-Sets vorhanden
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}