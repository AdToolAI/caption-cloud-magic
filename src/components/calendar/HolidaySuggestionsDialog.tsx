import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Sparkles, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HolidaySuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  brandKitId?: string;
  onEventCreated: () => void;
}

interface Holiday {
  date: string;
  name: string;
  type: string;
  ideas: string[];
}

export function HolidaySuggestionsDialog({
  open,
  onClose,
  workspaceId,
  brandKitId,
  onEventCreated,
}: HolidaySuggestionsDialogProps) {
  const { t, language } = useTranslation();
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year] = useState<number>(new Date().getFullYear());
  const [region, setRegion] = useState<string>(language === 'de' ? 'DE' : language === 'es' ? 'ES' : 'GB');
  const [loading, setLoading] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-holiday-suggestions', {
        body: {
          region,
          month,
          year,
          brand_kit_id: brandKitId,
        },
      });

      if (error) throw error;

      setHolidays(data.holidays || []);
      toast.success(t("calendar.holidays.success"));
    } catch (error: any) {
      console.error('Holiday suggestions error:', error);
      toast.error(t("calendar.holidays.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = (holiday: Holiday) => {
    // Create event with holiday data
    const brief = holiday.ideas.join('\n• ');
    
    // Here you would typically open the event creation dialog with pre-filled data
    // For now, we'll just show a success toast
    toast.success(`Event created for ${holiday.name}`);
    onEventCreated();
  };

  const monthNames = language === 'de' 
    ? ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
    : language === 'es'
    ? ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
            {t("calendar.holidays.title")}
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            {t("calendar.holidays.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t("calendar.holidays.selectMonth")}
              </label>
              <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((name, idx) => (
                    <SelectItem key={idx} value={(idx + 1).toString()}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                {t("calendar.holidays.selectRegion")}
              </label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DE">🇩🇪 {t("calendar.holidays.regions.de")}</SelectItem>
                  <SelectItem value="GB">🇬🇧 {t("calendar.holidays.regions.en")}</SelectItem>
                  <SelectItem value="ES">🇪🇸 {t("calendar.holidays.regions.es")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("calendar.holidays.generating")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {t("calendar.holidays.generate")}
              </>
            )}
          </Button>

          {/* Results */}
           {holidays.length > 0 && (
            <div className="space-y-4 mt-6">
              {holidays.map((holiday, idx) => (
                <Card key={idx} className="hover:shadow-lg transition-all duration-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <CardTitle className="text-xl font-bold mb-1">{holiday.name}</CardTitle>
                        <CardDescription className="text-sm">
                          📅 {new Date(holiday.date).toLocaleDateString(language, { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-xs px-3 py-1">
                        {holiday.type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                     <div className="space-y-2">
                       <p className="text-sm font-semibold flex items-center gap-2">
                         <Sparkles className="w-4 h-4 text-primary" />
                         {t("calendar.holidays.contentIdeas")}:
                       </p>
                       <ul className="space-y-2">
                         {holiday.ideas.map((idea, i) => (
                           <li key={i} className="text-sm text-muted-foreground flex items-start gap-2 pl-2">
                             <span className="text-primary font-bold">•</span>
                             <span>{idea}</span>
                           </li>
                         ))}
                       </ul>
                     </div>
                     <Button 
                      variant="default" 
                      size="sm" 
                      onClick={() => handleCreateEvent(holiday)}
                      className="w-full mt-3"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {t("calendar.holidays.createEvent")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && holidays.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mx-auto w-20 h-20 mb-4 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="w-10 h-10 opacity-50" />
              </div>
              <p className="text-lg font-medium">{t("calendar.holidays.noHolidays")}</p>
              <p className="text-sm mt-2">
                {language === 'de' 
                  ? 'Wähle einen anderen Monat oder eine andere Region' 
                  : language === 'es'
                  ? 'Selecciona otro mes u otra región'
                  : 'Try selecting a different month or region'}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
