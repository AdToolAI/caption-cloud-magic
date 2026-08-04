// Launch Radar — revenue signals derived from Stripe webhook events.
// Purely observational: never throws, never touches business logic.

import type Stripe from 'npm:stripe@18.5.0';
import { sendRadarAlert, claimMilestone, formatAmount } from './launch-radar.ts';

function ts(unix?: number | null): string {
  if (!unix) return '–';
  return new Date(unix * 1000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
}

function hasFoundersDiscount(sub: Stripe.Subscription | null): string {
  const anySub = sub as unknown as { discount?: { coupon?: { id?: string; name?: string } } } | null;
  const coupon = anySub?.discount?.coupon;
  if (!coupon) return 'nein';
  return `ja (${coupon.name || coupon.id})`;
}

/**
 * Emits an admin alert for every payment-relevant Stripe event.
 * Safe to call for any event type — unrelated events are ignored.
 */
export async function notifyRevenueEvent(
  event: Stripe.Event,
  stripe: Stripe,
  planOf: (productId: string) => string,
): Promise<void> {
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const isSubscription = !!session.subscription;
        let sub: Stripe.Subscription | null = null;
        if (isSubscription) {
          sub = await stripe.subscriptions.retrieve(session.subscription as string);
        }
        const productId = sub?.items.data[0]?.price.product as string | undefined;

        await sendRadarAlert({
          kind: 'purchase',
          title: isSubscription ? 'Neues Abo abgeschlossen' : 'Guthaben-Kauf',
          dedupeKey: `checkout:${session.id}`,
          lines: [
            ['Kunde', session.customer_details?.email || session.customer_email || '–'],
            ['Betrag', formatAmount(session.amount_total, session.currency)],
            ['Art', isSubscription ? 'Abo' : 'Einmalkauf'],
            ['Plan', productId ? planOf(productId) : '–'],
            ['Gründer-Rabatt', hasFoundersDiscount(sub)],
            ['Zeitpunkt', ts(event.created)],
          ],
        });

        if (await claimMilestone('first_payment', 'Erster zahlender Kunde', { session: session.id })) {
          await sendRadarAlert({
            kind: 'milestone',
            highlight: true,
            title: 'Der erste zahlende Kunde ist da',
            dedupeKey: 'milestone:first_payment',
            lines: [
              ['Kunde', session.customer_details?.email || session.customer_email || '–'],
              ['Betrag', formatAmount(session.amount_total, session.currency)],
              ['Zeitpunkt', ts(event.created)],
            ],
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const prev = (event.data.previous_attributes ?? {}) as Record<string, unknown>;
        const prevItems = prev.items as { data?: Array<{ price?: Stripe.Price }> } | undefined;
        const prevPrice = prevItems?.data?.[0]?.price;
        const newPrice = sub.items.data[0]?.price;

        // Only report actual plan changes, not renewals or metadata churn.
        if (!prevPrice || !newPrice || prevPrice.id === newPrice.id) break;

        const prevAmount = prevPrice.unit_amount ?? 0;
        const newAmount = newPrice.unit_amount ?? 0;
        const direction = newAmount > prevAmount ? 'Upgrade' : 'Downgrade';

        const customer = (await stripe.customers.retrieve(sub.customer as string)) as Stripe.Customer;

        await sendRadarAlert({
          kind: 'purchase',
          title: `Abo-${direction}`,
          dedupeKey: `sub_change:${sub.id}:${newPrice.id}:${event.created}`,
          lines: [
            ['Kunde', customer?.email || '–'],
            ['Vorher', `${planOf(prevPrice.product as string)} · ${formatAmount(prevAmount, prevPrice.currency)}`],
            ['Nachher', `${planOf(newPrice.product as string)} · ${formatAmount(newAmount, newPrice.currency)}`],
            ['Gründer-Rabatt', hasFoundersDiscount(sub)],
            ['Zeitpunkt', ts(event.created)],
          ],
        });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        // Skip the very first invoice of a subscription — already reported at checkout.
        if (invoice.billing_reason === 'subscription_create') break;

        await sendRadarAlert({
          kind: 'purchase',
          title: 'Verlängerung abgebucht',
          dedupeKey: `invoice_paid:${invoice.id}`,
          lines: [
            ['Kunde', invoice.customer_email || '–'],
            ['Betrag', formatAmount(invoice.amount_paid, invoice.currency)],
            ['Rechnung', invoice.number || invoice.id],
            ['Grund', String(invoice.billing_reason || '–')],
            ['Zeitpunkt', ts(event.created)],
          ],
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await sendRadarAlert({
          kind: 'purchase',
          title: 'Zahlung fehlgeschlagen',
          dedupeKey: `invoice_failed:${invoice.id}:${invoice.attempt_count || 1}`,
          lines: [
            ['Kunde', invoice.customer_email || '–'],
            ['Betrag', formatAmount(invoice.amount_due, invoice.currency)],
            ['Versuch', String(invoice.attempt_count || 1)],
            ['Rechnung', invoice.number || invoice.id],
            ['Zeitpunkt', ts(event.created)],
          ],
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customer = (await stripe.customers.retrieve(sub.customer as string)) as Stripe.Customer;
        const price = sub.items.data[0]?.price;

        await sendRadarAlert({
          kind: 'purchase',
          title: 'Abo gekündigt',
          dedupeKey: `sub_deleted:${sub.id}`,
          lines: [
            ['Kunde', customer?.email || '–'],
            ['Plan', price ? planOf(price.product as string) : '–'],
            ['Betrag', formatAmount(price?.unit_amount, price?.currency)],
            ['Zeitpunkt', ts(event.created)],
          ],
        });
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error('[LAUNCH-RADAR] revenue signal failed:', e instanceof Error ? e.message : e);
  }
}
