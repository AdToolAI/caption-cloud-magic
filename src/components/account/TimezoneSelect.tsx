import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Globe, Loader2 } from "lucide-react";

const TIMEZONES = [
  { value: "Europe/Berlin", label: "Berlin (MEZ/MESZ)" },
  { value: "Europe/Vienna", label: "Wien (MEZ/MESZ)" },
  { value: "Europe/Zurich", label: "Zürich (MEZ/MESZ)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (MEZ/MESZ)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (MEZ/MESZ)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
];

export const TimezoneSelect = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState("Europe/Berlin");

  useEffect(() => {
    const loadTimezone = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .single();

        if (error) throw error;
        
        if (data?.timezone) {
          setTimezone(data.timezone);
        } else {
          // Try to detect browser timezone
          const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const isSupported = TIMEZONES.some(tz => tz.value === browserTimezone);
          if (isSupported) {
            setTimezone(browserTimezone);
          }
        }
      } catch (error) {
        console.error("Error loading timezone:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTimezone();
  }, [user]);

  const handleTimezoneChange = async (value: string) => {
    if (!user) return;

    setSaving(true);
    setTimezone(value);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ timezone: value })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Zeitzone gespeichert");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Zeitzone
        </CardTitle>
        <CardDescription>
          Deine Zeitzone für Planungen und Benachrichtigungen
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label>Zeitzone auswählen</Label>
          <Select value={timezone} onValueChange={handleTimezoneChange} disabled={saving}>
            <SelectTrigger className="bg-muted/20 border-white/10">
              <SelectValue placeholder="Zeitzone wählen" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
