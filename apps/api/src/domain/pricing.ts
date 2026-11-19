export type PricingContext = {
  basePriceCents: number;
  eventStartsAt: Date;
  now: Date;
};

export type PricingStrategy = (context: PricingContext) => number;

export const basePricing: PricingStrategy = ({ basePriceCents }) => basePriceCents;

export const earlyBirdPricing: PricingStrategy = ({ basePriceCents, eventStartsAt, now }) => {
  const daysUntilEvent = (eventStartsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  return daysUntilEvent > 7 ? Math.round(basePriceCents * 0.9) : basePriceCents;
};

export const pricingStrategies = {
  base: basePricing,
  early_bird: earlyBirdPricing,
} satisfies Record<string, PricingStrategy>;

export type PricingStrategyName = keyof typeof pricingStrategies;

export function priceSeat(strategy: PricingStrategyName, context: PricingContext): number {
  if (!Number.isSafeInteger(context.basePriceCents) || context.basePriceCents < 0) {
    throw new RangeError('Base price must be a non-negative integer in cents');
  }
  return pricingStrategies[strategy](context);
}
