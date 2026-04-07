

## Plan: AI Video Guthaben auf $100 aufstocken

### Aktueller Stand
- User: bestofproducts4u@gmail.com
- Aktuelles Guthaben: **$1.38**
- Ziel: **$100.00**

### Änderung
**DB-Migration**: `balance_euros` auf `100.00` setzen und `total_purchased_euros` entsprechend um $98.62 erhöhen (von $10.00 auf $108.62), damit die Buchführung stimmt.

```sql
UPDATE ai_video_wallets 
SET balance_euros = 100.00,
    total_purchased_euros = total_purchased_euros + 98.62,
    updated_at = now()
WHERE user_id = '8948d3d9-2c5e-4405-9e9c-1624448e7189';
```

### Ergebnis
Guthaben wird sofort auf $100.00 angezeigt.

