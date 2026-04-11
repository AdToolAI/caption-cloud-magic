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
import { motion } from "framer-motion";

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0, 0, 0.2, 1] as const },
  }),
};

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
          <div key={i} className="rounded-xl backdrop-blur-xl bg-card/60 border border-white/10 p-6">
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Create slot */}
      <motion.div
        custom={0}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className="backdrop-blur-xl bg-card/60 border-white/10 shadow-[0_0_20px_hsla(43,90%,68%,0.04)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.1)] transition-all duration-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[hsl(43,90%,68%)]" />
                Eigenen Mentor-Slot anbieten
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)} className="border-white/10 hover:bg-white/5">
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
                  className="flex-1 bg-card/60 border-white/10"
                />
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={15}
                  max={120}
                  className="w-24 bg-card/60 border-white/10"
                  placeholder="Min"
                />
                <Button onClick={handleCreate} disabled={!slotTime} className="shadow-[0_0_15px_hsla(43,90%,68%,0.1)]">
                  Erstellen
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            title: "Verfügbare Slots",
            icon: null,
            items: openSlots,
            empty: "Keine offenen Slots verfügbar.",
            renderItem: (slot: any) => (
              <div key={slot.id} className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-card/40 backdrop-blur-md hover:bg-white/5 transition-all">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[hsla(43,90%,68%,0.2)] to-[hsla(187,84%,55%,0.15)] flex items-center justify-center">
                    <User className="h-3 w-3 text-[hsl(43,90%,68%)]" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{slot.profiles?.email?.split("@")[0] || "Mentor"}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: de })}
                      <Badge variant="outline" className="text-xs ml-1 border-white/10">{slot.duration_min} min</Badge>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => bookSlot(slot.id)} className="border-white/10 hover:bg-white/5">Buchen</Button>
              </div>
            ),
          },
          {
            title: "Meine angebotenen Slots",
            icon: null,
            items: mySlots,
            empty: "Du hast noch keine Slots erstellt.",
            renderItem: (slot: any) => (
              <div key={slot.id} className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-card/40 backdrop-blur-md">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: de })}
                </div>
                <Badge
                  variant={slot.status === "booked" ? "default" : "secondary"}
                  className={`text-xs ${slot.status === "booked" ? "shadow-[0_0_10px_hsla(43,90%,68%,0.15)]" : ""}`}
                >
                  {slot.status === "booked" ? "Gebucht" : "Offen"}
                </Badge>
              </div>
            ),
          },
          {
            title: "Meine gebuchten Sessions",
            icon: <CheckCircle className="h-4 w-4 text-[hsl(43,90%,68%)]" />,
            items: bookedByMe,
            empty: "Noch keine Sessions gebucht.",
            renderItem: (slot: any) => (
              <div key={slot.id} className="p-2 rounded-xl border border-[hsla(43,90%,68%,0.15)] bg-[hsla(43,90%,68%,0.04)]">
                <p className="text-xs font-medium">{slot.profiles?.email?.split("@")[0] || "Mentor"}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: de })}
                  <Badge variant="outline" className="text-xs ml-1 border-white/10">{slot.duration_min} min</Badge>
                </div>
              </div>
            ),
          },
        ].map((section, idx) => (
          <motion.div key={section.title} custom={idx + 1} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="backdrop-blur-xl bg-card/60 border-white/10 shadow-[0_0_20px_hsla(43,90%,68%,0.04)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.1)] hover:-translate-y-1 transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {section.icon}
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {section.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{section.empty}</p>
                ) : (
                  section.items.map(section.renderItem)
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
