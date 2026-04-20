

## Plan: Admin-Rechte für bestofproducts4u@gmail.com

### Was passiert
Ich füge einen Eintrag in der `user_roles` Tabelle hinzu, der dem User `bestofproducts4u@gmail.com` (ID: `8948d3d9-2c5e-4405-9e9c-1624448e7189`) die Rolle `admin` gibt.

### Technische Umsetzung
Eine einzige DB-Migration:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('8948d3d9-2c5e-4405-9e9c-1624448e7189', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

`ON CONFLICT DO NOTHING` schützt vor Fehlern, falls der Eintrag schon existieren würde.

### Was der User danach kann
- Zugriff auf `/admin` Dashboard
- Alle Tabs sehen: **Conversion Funnel**, **System Monitor**, **Email Monitor**, **Provider Health**, **Cache Health**
- Alle Admin-Edge-Functions ausführen (z.B. `admin-stats`)
- Alle Daten lesen, die durch `has_role(auth.uid(), 'admin')` RLS-Policies geschützt sind

### Was du danach tun musst
1. Der User muss sich **einmal aus- und wieder einloggen**, damit das Frontend die neue Rolle lädt (der `useUserRoles` Hook fetcht die Rollen beim Login)
2. Danach kann er `/admin` aufrufen — vorher sieht er weiterhin die "Access Denied"-Seite

### Sicherheitshinweis
Admin-Rechte geben **vollen Zugriff** auf alle Monitoring-Dashboards und sensible Daten (Email-Logs, Provider-Quotas, alle User-Stats). Bitte nur an vertrauenswürdige Personen vergeben.

Falls du die Rechte später wieder entziehen willst, einfach Bescheid geben — ein einziges `DELETE` reicht.

