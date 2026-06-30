// Single source of truth for whether the 4th of July promo is active.
// Client pages (index.html, services.html, cart.html) call this instead of
// trusting the visitor's device clock, which can be wrong (wrong timezone,
// manually changed date, etc.) and was causing the discount to silently not
// show for some mobile visitors. Server clock is always correct.
const PROMO_END = new Date('2026-07-07T06:59:59Z'); // 11:59:59pm PDT on July 6, 2026

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ active: Date.now() <= PROMO_END.getTime() });
};
