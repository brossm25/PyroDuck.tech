export interface ComboEntry {
  name: string;
  quantity: number;
  card_role: string;
}

export interface ComboCard {
  card: {
    id: number;
    name: string;
    oracleId: string | null;
  };
  quantity: number;
  mustBeCommander: boolean;
  zoneLocations: string[];
  battlefieldCardState: string;
  exileCardState: string;
  libraryCardState: string;
  graveyardCardState: string;
}

export interface SpellbookCombo {
  id: string;
  uses: ComboCard[];
  requires: {
    template: { name: string };
    quantity: number;
  }[];
  produces: {
    feature: { name: string };
    quantity: number;
  }[];
  manaNeeded: string;
  easyPrerequisites: string;
  notablePrerequisites: string;
  description: string;
  notes: string;
}

export interface DeckComboPage {
  next: string | null;
  results: {
    included: SpellbookCombo[];
    includedByChangingCommanders: SpellbookCombo[];
    almostIncluded: SpellbookCombo[];
    almostIncludedByAddingColors: SpellbookCombo[];
    almostIncludedByChangingCommanders: SpellbookCombo[];
    almostIncludedByAddingColorsAndChangingCommanders: SpellbookCombo[];
  };
}

export interface CardComboPage {
  next: string | null;
  results: SpellbookCombo[];
}

const api = "https://backend.commanderspellbook.com";

export function comboNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/[’‘]/g, "'");
}

function deckCards(entries: readonly ComboEntry[], role: string) {
  const cards = new Map<string, { card: string; quantity: number }>();

  for (const entry of entries) {
    if (entry.card_role !== role) continue;

    const key = comboNameKey(entry.name);
    const existing = cards.get(key);

    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      cards.set(key, {
        card: entry.name,
        quantity: entry.quantity,
      });
    }
  }

  return [...cards.values()];
}

function pageURL(path: string, next?: string | null): URL {
  const url = next ? new URL(next, api) : new URL(path, api);

  if (url.origin !== api || url.pathname.replace(/\/$/, "") !== path) {
    throw new Error("The combo service returned an invalid page link.");
  }

  if (!next) url.searchParams.set("limit", "40");

  return url;
}

async function requestJSON(
  url: URL,
  signal: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Commander Spellbook asked us to slow down. Try again shortly."
        : "Couldn’t load combos from Commander Spellbook. Try again shortly.",
    );
  }

  return response.json();
}

export async function findDeckCombosPage(
  entries: readonly ComboEntry[],
  signal: AbortSignal,
  next?: string | null,
): Promise<DeckComboPage> {
  const main = deckCards(entries, "main");
  const commanders = deckCards(entries, "commander");

  if (main.length > 600 || commanders.length > 12) {
    throw new Error(
      "Combo lookup supports up to 600 distinct main-deck cards and 12 commanders.",
    );
  }

  const data = (await requestJSON(pageURL("/find-my-combos", next), signal, {
    main,
    commanders,
  })) as DeckComboPage;

  if (
    !data?.results ||
    !Array.isArray(data.results.included) ||
    !Array.isArray(data.results.almostIncluded)
  ) {
    throw new Error("Commander Spellbook returned an unexpected response.");
  }

  return data;
}

export async function findCardCombosPage(
  name: string,
  signal: AbortSignal,
  next?: string | null,
): Promise<CardComboPage> {
  const url = pageURL("/variants", next);

  if (!next) {
    const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    url.searchParams.set("q", `card="${escaped}"`);
  }

  const data = (await requestJSON(url, signal)) as CardComboPage;

  if (!Array.isArray(data?.results)) {
    throw new Error("Commander Spellbook returned an unexpected response.");
  }

  return data;
}
