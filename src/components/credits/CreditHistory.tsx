import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Clock, History, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Transaction {
  id: string;
  amount: number;
  transaction_type: 'credit' | 'debit' | 'refund';
  feature_code: string;
  created_at: string;
}

export const CreditHistory = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user) return;

      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from('user_credit_transactions')
          .select('id, amount, transaction_type, feature_code, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        setTransactions((data || []) as Transaction[]);
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();

    const channel = supabase
      .channel(`credit-transactions-${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_credit_transactions',
          filter: `user_id=eq.${user?.id}`,
        },
        (payload) => {
          setTransactions((prev) => [payload.new as Transaction, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'credit':
        return { icon: ArrowUp, color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/20', label: 'Gutschrift' };
      case 'debit':
        return { icon: ArrowDown, color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/20', label: 'Abbuchung' };
      case 'refund':
        return { icon: Clock, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10 border-cyan-500/20', label: 'Rückerstattung' };
      default:
        return { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted/10 border-muted/20', label: 'Sonstige' };
    }
  };

  const getFeatureLabel = (code: string) => {
    const labels: Record<string, string> = {
      'caption_generate': 'Caption generieren',
      'hashtag_analyze': 'Hashtag Analyse',
      'bio_optimize': 'Bio optimieren',
      'post_schedule': 'Post planen',
      'trend_fetch': 'Trend abrufen',
      'image_process': 'Bild verarbeiten',
      'comment_analyze': 'Kommentar analysieren',
      'background_generate': 'Hintergrund generieren',
      'coach_chat': 'Coach Chat',
      'monthly_topup': 'Monatliche Aufladung',
      'manual_credit': 'Manuelle Gutschrift',
      'refund': 'Rückerstattung'
    };
    return labels[code] || code;
  };

  if (loading) {
    return (
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-muted-foreground">Transaktionen werden geladen...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-white/5">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <History className="h-5 w-5 text-primary" />
            </motion.div>
            <div>
              <CardTitle>Credit-Verlauf</CardTitle>
              <CardDescription>Ihre letzten 20 Transaktionen</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-4"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="h-12 w-12 text-primary/50" />
              </motion.div>
              <p className="text-muted-foreground">Noch keine Transaktionen vorhanden</p>
            </motion.div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-medium">Datum</TableHead>
                    <TableHead className="text-muted-foreground font-medium">Feature</TableHead>
                    <TableHead className="text-muted-foreground font-medium">Typ</TableHead>
                    <TableHead className="text-right text-muted-foreground font-medium">Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx, index) => {
                    const typeInfo = getTypeInfo(tx.transaction_type);
                    const Icon = typeInfo.icon;
                    return (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(tx.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {getFeatureLabel(tx.feature_code)}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`gap-1.5 ${typeInfo.bgColor} border ${typeInfo.color}`}
                          >
                            <Icon className={`h-3 w-3 ${typeInfo.color}`} />
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${typeInfo.color}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                          </span>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
