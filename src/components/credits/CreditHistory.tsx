import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Clock } from "lucide-react";
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
        
        // Fetch real transactions from user_credit_transactions
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

    // Set up realtime subscription for new transactions
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
        return { icon: ArrowUp, color: 'text-green-600', label: 'Gutschrift' };
      case 'debit':
        return { icon: ArrowDown, color: 'text-red-600', label: 'Abbuchung' };
      case 'refund':
        return { icon: Clock, color: 'text-blue-600', label: 'Rückerstattung' };
      default:
        return { icon: Clock, color: 'text-gray-600', label: 'Sonstige' };
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
    return <Card><CardContent className="p-6">Lade...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit-Verlauf</CardTitle>
        <CardDescription>Ihre letzten 20 Transaktionen</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Noch keine Transaktionen vorhanden</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Feature</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const typeInfo = getTypeInfo(tx.transaction_type);
                const Icon = typeInfo.icon;
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(tx.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {getFeatureLabel(tx.feature_code)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Icon className={`h-3 w-3 ${typeInfo.color}`} />
                        {typeInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${typeInfo.color}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
