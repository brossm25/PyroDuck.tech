import { cardData } from "./deckCardData";
import { fetchImportCard, type ImportCard } from "./cardImportMatch";

interface PreconCard {
  name: string;
  count: number;
  scryfallId: string | null;
  side: string | null;
}

interface PreconDeck {
  id: string;
  name: string;
  commanders: PreconCard[];
  mainBoard: PreconCard[];
}

export async function preparePrecon(
  id: string,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid precon ID.");
  }

  const response = await fetch(`/data/precons/${encodeURIComponent(id)}.json`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });

  if (!response.ok) {
    throw new Error("Couldn’t load the precon list. Please retry.");
  }

  const deck = (await response.json()) as PreconDeck;

  if (
    deck.id !== id ||
    typeof deck.name !== "string" ||
    !Array.isArray(deck.commanders) ||
    !Array.isArray(deck.mainBoard)
  ) {
    throw new Error("Invalid precon list.");
  }

  const source = [
    ...deck.commanders.map((card) => ({
      ...card,
      role: "commander" as const,
    })),
    ...deck.mainBoard.map((card) => ({
      ...card,
      role: "main" as const,
    })),
  ].filter((card) => !card.side || card.side === "a");

  if (
    !source.length ||
    source.length > 200 ||
    !source.some((card) => card.role === "commander") ||
    source.some(
      (card) =>
        !Number.isSafeInteger(card.count) ||
        card.count < 1 ||
        card.count > 1000 ||
        !card.scryfallId ||
        !/^[0-9a-f-]{36}$/i.test(card.scryfallId),
    )
  ) {
    throw new Error(
      "This precon has missing printing IDs or invalid quantities.",
    );
  }

  const prepared = [];

  for (const [index, entry] of source.entries()) {
    signal.throwIfAborted();
    progress(`Preparing ${index + 1} of ${source.length}: ${entry.name}`);

    const cardResponse = await fetchImportCard(
      new URL(`https://api.scryfall.com/cards/${entry.scryfallId}`),
      signal,
    );

    if (!cardResponse.ok) {
      throw new Error(`Couldn’t load ${entry.name}. Please retry.`);
    }

    const card = (await cardResponse.json()) as ImportCard;
    signal.throwIfAborted();

    if (
      card.id !== entry.scryfallId ||
      !card.games?.includes("paper") ||
      !Array.isArray(card.finishes)
    ) {
      throw new Error(`Invalid printing data for ${entry.name}.`);
    }

    // The catalog does not specify the supplied finish.
    // Prefer nonfoil, then foil, then etched when available.
    const finish = ["nonfoil", "foil", "etched"].find((value) =>
      card.finishes.includes(value),
    );

    if (!finish) {
      throw new Error(`No supported finish for ${entry.name}.`);
    }

    prepared.push({
      scryfall_id: card.id,
      oracle_id: card.oracle_id ?? null,
      name: card.name,
      set_name: card.set_name,
      collector_number: card.collector_number,
      finish,
      quantity: entry.count,
      card_role: entry.role,
      image_url:
        card.image_uris?.normal ??
        card.card_faces?.[0]?.image_uris?.normal ??
        null,
      scryfall_uri: card.scryfall_uri,
      ...cardData(card, finish),
    });
  }

  return { name: deck.name, cards: prepared };
}
