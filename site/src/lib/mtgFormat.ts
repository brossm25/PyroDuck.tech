type PriceValue = number | string | null | undefined;

interface PricedCard {
  price_usd?: PriceValue;
  manual_price_usd?: PriceValue;
}

export function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function parsePrice(value: PriceValue): number | null {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function effectivePrice(entry: PricedCard) {
  const scryfall = parsePrice(entry.price_usd);
  const manual = parsePrice(entry.manual_price_usd);

  return {
    amount: scryfall ?? manual,
    manual: scryfall === null && manual !== null,
  };
}

export function quantityOf(
  entries: ReadonlyArray<{ quantity: number }>,
): number {
  return entries.reduce((total, entry) => total + entry.quantity, 0);
}

export function safeCardImage(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname === "cards.scryfall.io"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function safeScryfallHref(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    return url.origin === "https://scryfall.com" &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
