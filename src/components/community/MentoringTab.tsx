import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, User, Plus, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useMentorSlots } from "@/hooks/useMentorSlots";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

export function MentoringTab() {
  const { user } = useAuth();
  const { slots, loading, bookSlot, createSlot } = useMentorSlots();
  const [showCreate, setShowCreate] = useState(false);
  const [slotTime, setSlotTime] = useState("");
  const [duration, setDuration] = useState(30);

  const openSlots = slots.filter((s) => s.status === "open" && s.mentor_user_id !== user?.id);
  const mySlots = slots.filter((s) => s.mentor_user_id === user?.id);
  const bookedByMe = slots.filter((s) => s.booked_by === user?.id);

  const handleCreate = () => {
    if (!slotTime) return;
    createSlot(slotTime, duration);
    setShowCreate(false);
    setSlotTime("");
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create slot */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Eigenen Mentor-Slot anbieten
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-4 w-4 mr-1" /> Slot erstellen
            </Button>
          </div>
        </CardHeader>
        {showCreate && (
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <Input
                type="datetime-local"
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={15}
                max={120}
                className="w-24"
                placeholder="Min"
              />
              <Button onClick={handleCreate} disabled={!slotTime}>Erstellen</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Available slots */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Verfügbare Slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">Keine offenen Slots verfügbar.</p>
            ) : (
              openSlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">{slot.profiles?.email?.split("@")[0] || "Mentor"}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: de })}
                        <Badge variant="outline" className="text-xs ml-1">{slot.duration_min} min</Badge>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => bookSlot(slot.id)}>Buchen</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* My offered slots */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Meine angebotenen Slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mySlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">Du hast noch keine Slots erstellt.</p>
            ) : (
              mySlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: de })}
                    </div>
                  </div>
                  <Badge variant={slot.status === "booked" ? "default" : "secondary"} className="text-xs">
                    {slot.status === "booked" ? "Gebucht" : "Offen"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* My booked sessions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              Meine gebuchten Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bookedByMe.length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch keine Sessions gebucht.</p>
            ) : (
              bookedByMe.map((slot) => (
                <div key={slot.id} className="p-2 rounded-lg border bg-primary/5">
                  <p className="text-xs font-medium">{slot.profiles?.email?.split("@")[0] || "Mentor"}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: de })}
                    <Badge variant="outline" className="text-xs ml-1">{slot.duration_min} min</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
