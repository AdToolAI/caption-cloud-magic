import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

interface SectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bg?: 'default' | 'muted';
}

export function Section({ 
  title, 
  description, 
  action, 
  children, 
  className = '', 
  bg = 'default' 
}: SectionProps) {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <motion.section 
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`py-6 rounded-2xl ${bg === 'muted' ? 'bg-muted/30 backdrop-blur-sm' : ''} ${className}`}
    >
      <div className="container max-w-7xl mx-auto px-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap items-center justify-between gap-2 mb-4"
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground break-words">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 break-words">{description}</p>
            )}
          </div>
          {action}

        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {children}
        </motion.div>
      </div>
    </motion.section>
  );
}
