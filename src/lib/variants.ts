export interface ParsedVariant {
  name: string;
  priceCents: number;
  customPriceCents: number | null;
}

export interface VariantInput {
  name: string;
  priceCents?: number | null;
}

/**
 * Parses `Product.variants` into a uniform list of options with resolved prices.
 * Supports both JSON arrays (`[{"name":"L","priceCents":300}]`) and legacy comma-separated strings (`"S, M, L"`).
 */
export function parseProductVariants(
  raw: string | null | undefined,
  basePriceCents: number,
): ParsedVariant[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{ name?: unknown; priceCents?: unknown }>;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            const name = typeof item?.name === 'string' ? item.name.trim() : '';
            if (!name) return null;
            const custom =
              typeof item?.priceCents === 'number' && item.priceCents > 0
                ? Math.round(item.priceCents)
                : null;
            return {
              name,
              priceCents: custom ?? basePriceCents,
              customPriceCents: custom,
            };
          })
          .filter((v): v is ParsedVariant => v !== null);
      }
    } catch {
      // Fall through to comma-separated parsing
    }
  }

  return trimmed
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      priceCents: basePriceCents,
      customPriceCents: null,
    }));
}

/** Resolves the unit price in cents for a selected variant name, falling back to `basePriceCents`. */
export function resolveVariantPriceCents(
  raw: string | null | undefined,
  basePriceCents: number,
  variantName?: string | null,
): number {
  if (!variantName) return basePriceCents;
  const variants = parseProductVariants(raw, basePriceCents);
  const match = variants.find((v) => v.name === variantName.trim());
  return match ? match.priceCents : basePriceCents;
}

/** Serializes variant options for storage in `Product.variants`. */
export function serializeProductVariants(items: VariantInput[]): string | null {
  const cleaned = items
    .map((item) => ({
      name: item.name.trim(),
      priceCents:
        typeof item.priceCents === 'number' && item.priceCents > 0
          ? Math.round(item.priceCents)
          : null,
    }))
    .filter((item) => item.name.length > 0);

  if (cleaned.length === 0) return null;

  const hasCustomPrice = cleaned.some((item) => item.priceCents !== null);
  if (!hasCustomPrice) {
    return cleaned.map((item) => item.name).join(', ');
  }

  return JSON.stringify(cleaned);
}
