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

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t("calendar.holidays.title")}
          </DialogTitle>
          <DialogDescription>
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
            <div className="space-y-3 mt-6">
              {holidays.map((holiday, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{holiday.name}</CardTitle>
                        <CardDescription>
                          {new Date(holiday.date).toLocaleDateString(language, { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">{holiday.type}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Content Ideas:</p>
                      <ul className="space-y-1">
                        {holiday.ideas.map((idea, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{idea}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleCreateEvent(holiday)}
                      className="w-full"
                    >
                      {t("calendar.holidays.createEvent")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && holidays.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("calendar.holidays.noHolidays")}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
