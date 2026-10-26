export interface DeckCard {
  id: string;
  oracle_id?: string;
  oracle_text?: string;
  name: string;
  set_name: string;
  collector_number: string;
  scryfall_uri: string;
  prints_search_uri: string;
  finishes: string[];
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  game_changer?: boolean | null;
  legalities?: {
    commander?: "legal" | "not_legal" | "restricted" | "banned";
  };
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  };
  image_uris?: { normal: string };
  card_faces?: {
    name?: string;
    oracle_text?: string;
    type_line?: string;
    mana_cost?: string;
    colors?: string[];
    image_uris?: { normal: string };
  }[];
}

export function cardData(card: DeckCard, selectedFinish: string) {
  const rawPrice =
    selectedFinish === "etched"
      ? card.prices?.usd_etched
      : selectedFinish === "foil"
        ? card.prices?.usd_foil
        : card.prices?.usd;

  const price =
    rawPrice === null || rawPrice === undefined || rawPrice === ""
      ? NaN
      : Number(rawPrice);

  return {
    oracle_text:
      card.oracle_text ??
      (card.card_faces?.length
        ? card.card_faces
            .map((face) =>
              [face.name, face.oracle_text].filter(Boolean).join("\n"),
            )
            .join("\n\n")
        : null),
    card_faces: (card.card_faces ?? []).map((face) => ({
      name: face.name ?? card.name,
      image_url: face.image_uris?.normal ?? null,
      oracle_text: face.oracle_text ?? "",
    })),
    type_line: card.type_line ?? card.card_faces?.[0]?.type_line ?? null,
    mana_cost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? null,
    mana_value:
      typeof card.cmc === "number" && Number.isFinite(card.cmc)
        ? card.cmc
        : null,
    colors: card.colors ?? card.card_faces?.[0]?.colors ?? [],
    color_identity: card.color_identity ?? [],
    game_changer:
      typeof card.game_changer === "boolean" ? card.game_changer : null,
    power_checked_at:
      typeof card.game_changer === "boolean" ? new Date().toISOString() : null,
    commander_legality: card.legalities?.commander ?? null,
    legality_checked_at: card.legalities?.commander
      ? new Date().toISOString()
      : null,
    price_usd: Number.isFinite(price) && price >= 0 ? price : null,
    price_checked_at: new Date().toISOString(),
  };
}
