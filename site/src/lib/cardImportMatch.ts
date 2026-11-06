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

let nextRequestAt = 0;

async function waitForRequest(delay: number, signal: AbortSignal) {
  signal.throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);

    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }

    signal.addEventListener("abort", abort, { once: true });
  });

  signal.throwIfAborted();
}

async function fetchImportCard(url: URL, signal: AbortSignal) {
  for (let attempt = 0; attempt < 4; attempt++) {
    signal.throwIfAborted();

    // Reserve a request slot, including retries.
    const start = Math.max(Date.now(), nextRequestAt);
    nextRequestAt = start + 250;
    await waitForRequest(Math.max(0, start - Date.now()), signal);

    let retryDelay = 1000 * 2 ** attempt;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        headers: { Accept: "application/json" },
      });

      signal.throwIfAborted();

      const retryable =
        response.status === 429 ||
        response.status === 408 ||
        response.status >= 500;

      if (!retryable) return response;

      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const requestedDelay = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retryAfter) - Date.now();

        if (Number.isFinite(requestedDelay)) {
          retryDelay = Math.max(retryDelay, requestedDelay);
        }
      }

      if (attempt === 3) {
        throw new Error(
          `Scryfall lookup failed after four attempts (HTTP ${response.status}).`,
        );
      }
    } catch (error) {
      signal.throwIfAborted();
      if (attempt === 3) throw error;
    }

    await waitForRequest(retryDelay, signal);
  }

  throw new Error("Card lookup failed. Please retry.");
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

  const response = await fetchImportCard(endpoint, signal);

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
