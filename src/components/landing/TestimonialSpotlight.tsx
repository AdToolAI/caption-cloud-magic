import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Quote, Star } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const testimonials = [
  {
    id: "sarah",
    quoteKey: "landing.testimonials.t1.quote",
    nameKey: "landing.testimonials.t1.name",
    roleKey: "landing.testimonials.t1.role",
    initial: "S",
  },
  {
    id: "marco",
    quoteKey: "landing.testimonials.t2.quote",
    nameKey: "landing.testimonials.t2.name",
    roleKey: "landing.testimonials.t2.role",
    initial: "M",
  },
  {
    id: "lisa",
    quoteKey: "landing.testimonials.t3.quote",
    nameKey: "landing.testimonials.t3.name",
    roleKey: "landing.testimonials.t3.role",
    initial: "L",
  },
];

export const TestimonialSpotlight = () => {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % testimonials.length), 7000);
    return () => clearInterval(id);
  }, []);

  const current = testimonials[idx];

  return (
    <section className="relative py-24 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsla(43,90%,68%,0.05),transparent_70%)] pointer-events-none" />

      <div className="container max-w-4xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-primary font-semibold px-3 py-1 border border-primary/30 bg-card/40 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
            {t("landing.testimonials.badge")}
          </span>
        </motion.div>

        <div
          className="relative bg-card/40 backdrop-blur-md border border-primary/20 p-8 md:p-14"
          style={{
            borderRadius: "4px",
            boxShadow:
              "0 20px 60px -20px hsla(43, 90%, 68%, 0.18), inset 0 1px 0 hsla(43, 90%, 68%, 0.1)",
          }}
        >
          {/* Top hairline */}
          <div className="absolute inset-x-12 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <Quote className="absolute top-6 right-6 h-12 w-12 text-primary/15" strokeWidth={1.5} />

          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-1 mb-6">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="h-4 w-4 fill-primary text-primary" strokeWidth={1} />
                ))}
              </div>

              <blockquote className="font-display text-xl md:text-2xl lg:text-3xl text-foreground leading-snug mb-8 font-medium">
                "{t(current.quoteKey)}"
              </blockquote>

              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 flex items-center justify-center text-base font-bold text-black bg-gradient-to-br from-primary to-gold-dark"
                  style={{ borderRadius: "3px" }}
                >
                  {current.initial}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {t(current.nameKey)}
                  </div>
                  <div className="text-xs text-muted-foreground tracking-wide">
                    {t(current.roleKey)}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Indicators */}
          <div className="flex items-center gap-2 mt-8">
            {testimonials.map((tm, i) => (
              <button
                key={tm.id}
                onClick={() => setIdx(i)}
                aria-label={`Show testimonial ${i + 1}`}
                className={`h-1 transition-all duration-500 ${
                  idx === i ? "w-10 bg-primary" : "w-5 bg-primary/20 hover:bg-primary/40"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
