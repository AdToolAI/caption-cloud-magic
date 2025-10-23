import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, Euro } from "lucide-react";

interface EnterpriseSeatManagerProps {
  memberCount: number;
  maxMembers: number;
  currency: "EUR" | "USD";
  seatPrice: number;
}

export const EnterpriseSeatManager = ({ 
  memberCount, 
  maxMembers, 
  currency,
  seatPrice 
}: EnterpriseSeatManagerProps) => {
  const CurrencyIcon = currency === "EUR" ? Euro : DollarSign;
  const currencySymbol = currency === "EUR" ? "€" : "$";
  const monthlyTotal = memberCount * seatPrice;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Enterprise Seats
            </CardTitle>
            <CardDescription>
              Manage your team member capacity
            </CardDescription>
          </div>
          <Badge variant="default" className="text-lg px-3 py-1">
            <Users className="h-4 w-4 mr-1" />
            {memberCount} / {maxMembers}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Per Member</p>
            <p className="text-2xl font-bold flex items-center gap-1">
              <CurrencyIcon className="h-5 w-5" />
              {currencySymbol}{seatPrice.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">per month</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Monthly Total</p>
            <p className="text-2xl font-bold flex items-center gap-1">
              <CurrencyIcon className="h-5 w-5" />
              {currencySymbol}{monthlyTotal.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              for {memberCount} member{memberCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted p-3 space-y-2">
          <p className="text-sm font-medium">Billing Information</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Seats are billed automatically when members join</li>
            <li>• Pro-rated charges apply for mid-cycle additions</li>
            <li>• Unused seats are credited when members leave</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
