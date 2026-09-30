/**
 * Per-model token prices, USD per million tokens. SPEC.md §11.
 *
 * The OpenAI API does not return a cost, so it is computed here. Prices change:
 * an unknown model yields a null cost rather than a wrong number, and the UI
 * says "unknown" instead of quietly under-reporting.
 */
export type Price = { input: number; cachedInput: number; output: number };

export const PRICES: Record<string, Price> = {
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
};

export function priceFor(model: string): Price | undefined {
  return PRICES[model] ?? PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
}

export function computeCost(
  model: string,
  tokens: { input: number; cachedInput: number; output: number },
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const fresh = Math.max(0, tokens.input - tokens.cachedInput);
  return (
    (fresh * price.input + tokens.cachedInput * price.cachedInput + tokens.output * price.output) /
    1_000_000
  );
}
