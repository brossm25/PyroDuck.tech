import type { ImportFinish, ImportRow } from "./cardImport";
import type { DeckCard } from "./deckCardData";

export interface ImportCard extends DeckCard {
  set: string;
  games: string[];
}

export interface ImportMatch {
  row: ImportRow;
  card: ImportCard | null;
  finish: ImportFinish | null;
  automaticPrinting: boolean;
  issue: string | null;
}

interface SearchResult {
  data: ImportCard[];
}

function normalizedName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .trim()
    .toLocaleLowerCase();
}

function quoted(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function matchImportRow(
  row: ImportRow,
  signal: AbortSignal,
): Promise<ImportMatch> {
  const result: ImportMatch = {
    row,
    card: null,
    finish: row.finish,
    automaticPrinting: !row.set || !row.collector,
    issue: null,
  };

  let endpoint: URL;
  let searchResult = false;

  if (row.set && row.collector) {
    endpoint = new URL(
      `https://api.scryfall.com/cards/` +
        `${encodeURIComponent(row.set.toLowerCase())}/` +
        encodeURIComponent(row.collector),
    );
  } else if (row.set) {
    endpoint = new URL("https://api.scryfall.com/cards/search");
    endpoint.searchParams.set(
      "q",
      `!${quoted(row.name)} set:${row.set.toLowerCase()} game:paper`,
    );
    endpoint.searchParams.set("unique", "prints");
    endpoint.searchParams.set("order", "released");
    endpoint.searchParams.set("dir", "desc");
    searchResult = true;
  } else {
    endpoint = new URL("https://api.scryfall.com/cards/named");
    endpoint.searchParams.set("exact", row.name);
  }

  const response = await fetch(endpoint, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    result.issue =
      row.set && row.collector
        ? "Exact printing not found. Choose a version."
        : "Card not found. Check the name or choose a version.";
    return result;
  }

  if (response.status === 429) {
    throw new Error(
      "Scryfall is receiving too many requests. Wait a moment and retry.",
    );
  }

  if (!response.ok) {
    throw new Error(
      "Couldn’t contact Scryfall. Your deck has not been changed.",
    );
  }

  const payload = await response.json();
  signal.throwIfAborted();

  const card = searchResult
    ? (payload as SearchResult).data?.[0]
    : (payload as ImportCard);

  if (!card?.id || !Array.isArray(card.finishes)) {
    throw new Error("Scryfall returned incomplete card information.");
  }

  const names = [
    card.name,
    ...(card.card_faces ?? []).map((face) => face.name ?? ""),
  ];

  if (
    !names.some((name) => normalizedName(name) === normalizedName(row.name))
  ) {
    result.issue = `This printing belongs to “${card.name}”. Review the card name.`;
    return result;
  }

  if (!card.games?.includes("paper")) {
    result.issue = "No paper version matched. Choose a paper printing.";
    return result;
  }

  result.card = card;

  if (row.finish && !card.finishes.includes(row.finish)) {
    result.finish = null;
    result.issue =
      "The requested finish is unavailable for this printing. Choose a finish.";
    return result;
  }

  const available = card.finishes.filter(
    (finish): finish is ImportFinish =>
      finish === "nonfoil" || finish === "foil" || finish === "etched",
  );

  result.finish =
    row.finish ??
    (available.includes("nonfoil") ? "nonfoil" : (available[0] ?? null));

  if (!result.finish) {
    result.issue = "No supported finish found. Choose another printing.";
  }

  return result;
}
