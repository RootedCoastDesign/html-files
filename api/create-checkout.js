const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ─────────────────────────────────────────────────────────────
// MAP: cart key → Stripe Price ID
//
// For packages with a 50/50 split (Sapling, Timber, Old Growth):
//   - depositPriceId = 50% charged at checkout
//   - balancePriceId = 50% you invoice manually when site launches
//   - type: 'deposit'
//
// For everything else: priceId + type: 'one_time' or 'subscription'
// ─────────────────────────────────────────────────────────────
const PRICE_MAP = {
  // ── Website Packages (50% deposit at checkout) ──
  sapling: {
    type:           'deposit',
    depositPriceId: 'price_REPLACE_SAPLING_DEPOSIT',   // $248.50
    balancePriceId: 'price_REPLACE_SAPLING_BALANCE',   // $248.50
    fullPrice:      497,
  },
  timber: {
    type:           'deposit',
    depositPriceId: 'price_REPLACE_TIMBER_DEPOSIT',    // $498.50
    balancePriceId: 'price_REPLACE_TIMBER_BALANCE',    // $498.50
    fullPrice:      997,
  },
  oldgrowth: {
    type:           'deposit',
    depositPriceId: 'price_REPLACE_OLDGROWTH_DEPOSIT', // $998.50
    balancePriceId: 'price_REPLACE_OLDGROWTH_BALANCE', // $998.50
    fullPrice:      1997,
  },

  // ── Reskin (full price upfront) ──
  reskin: { type: 'one_time', priceId: 'price_REPLACE_RESKIN', fullPrice: 197 },

  // ── Care Plans (recurring monthly) ──
  'care-sapling-sa':   { type: 'subscription', priceId: 'price_REPLACE_CARE_SAPLING',   monthly: 59  },
  'care-timber-sa':    { type: 'subscription', priceId: 'price_REPLACE_CARE_TIMBER',    monthly: 99  },
  'care-oldgrowth-sa': { type: 'subscription', priceId: 'price_REPLACE_CARE_OLDGROWTH', monthly: 179 },

  // ── Add-Ons (full price upfront) ──
  copywriting: { type: 'one_time', priceId: 'price_REPLACE_COPYWRITING', fullPrice: 249 },
  photos:      { type: 'one_time', priceId: 'price_REPLACE_PHOTOS',      fullPrice: 99  },
  gbp:         { type: 'one_time', priceId: 'price_REPLACE_GBP',         fullPrice: 79  },
  booking:     { type: 'one_time', priceId: 'price_REPLACE_BOOKING',     fullPrice: 149 },
  email:       { type: 'one_time', priceId: 'price_REPLACE_EMAIL',       fullPrice: 129 },
  reviews:     { type: 'one_time', priceId: 'price_REPLACE_REVIEWS',     fullPrice: 79  },
  revision:    { type: 'one_time', priceId: 'price_REPLACE_REVISION',    fullPrice: 79  },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { cartKeys, customerEmail, customerName, businessName, siteUrl } = req.body;

  if (!cartKeys || !Array.isArray(cartKeys) || cartKeys.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const lineItems   = [];
  const unknownKeys = [];
  const balanceItems = []; // tracked for metadata — you send these manually at launch

  for (const key of cartKeys) {
    const item = PRICE_MAP[key];
    if (!item) { unknownKeys.push(key); continue; }

    if (item.type === 'deposit') {
      if (item.depositPriceId.startsWith('price_REPLACE')) { unknownKeys.push(key); continue; }
      lineItems.push({ price: item.depositPriceId, quantity: 1 });
      balanceItems.push({ key, balancePriceId: item.balancePriceId, amount: item.fullPrice / 2 });
    } else if (item.type === 'one_time' || item.type === 'subscription') {
      if (item.priceId.startsWith('price_REPLACE')) { unknownKeys.push(key); continue; }
      lineItems.push({ price: item.priceId, quantity: 1 });
    }
  }

  if (lineItems.length === 0) {
    return res.status(400).json({
      error: 'No valid items — have you replaced the price IDs in api/create-checkout.js?',
    });
  }

  // If any item is a subscription, Stripe requires mode: 'subscription'
  const hasSubscription = cartKeys.some(k => PRICE_MAP[k]?.type === 'subscription');
  const mode = hasSubscription ? 'subscription' : 'payment';

  const base = siteUrl || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://www.timberlanddigital.com');

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      metadata: {
        business_name:  businessName || '',
        customer_name:  customerName || '',
        cart_keys:      cartKeys.join(','),
        skipped_keys:   unknownKeys.join(','),
        // Reminds you which balance invoices to send at launch
        balance_due_at_launch: balanceItems
          .map(b => `${b.key}=$${b.amount}`)
          .join(', '),
      },
      success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/cart.html`,
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
    });

    return res.status(200).json({
      url:     session.url,
      skipped: unknownKeys,
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
