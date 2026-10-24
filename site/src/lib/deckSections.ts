interface SectionEntry {
  card_role: string;
  type_line: string | null;
}

export const sectionNames = [
  "Planeswalkers",
  "Creatures",
  "Artifacts",
  "Instants",
  "Sorceries",
  "Enchantments",
  "Lands",
  "Other",
  "Sideboard",
  "Maybeboard",
];

export const roleNames: Record<string, string> = {
  main: "Main deck",
  commander: "Commander",
  sideboard: "Sideboard",
  maybeboard: "Maybeboard",
};

export function sectionFor(entry: SectionEntry): string {
  if (entry.card_role === "commander") return "Commanders";
  if (entry.card_role === "sideboard") return "Sideboard";
  if (entry.card_role === "maybeboard") return "Maybeboard";

  const type = (entry.type_line ?? "").split(" // ")[0].split("—")[0];

  if (/\bLand\b/.test(type)) return "Lands";
  if (/\bCreature\b/.test(type)) return "Creatures";
  if (/\bPlaneswalker\b/.test(type)) return "Planeswalkers";
  if (/\bArtifact\b/.test(type)) return "Artifacts";
  if (/\bInstant\b/.test(type)) return "Instants";
  if (/\bSorcery\b/.test(type)) return "Sorceries";
  if (/\bEnchantment\b/.test(type)) return "Enchantments";
  return "Other";
}
