interface CheckEntry {
  id: string;
  name: string;
  quantity: number;
  card_role: string;
  type_line: string | null;
  oracle_text: string | null;
  color_identity: string[] | null;
}

export interface DeckCheckResult {
  notes: string[];
  warnings: Map<string, string[]>;
}

const colorNames: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};

const basicLandColors: Record<string, string> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};

function copyLimit(entry: CheckEntry): number | null {
  if (/\bBasic\b/.test(entry.type_line?.split("—")[0] ?? "")) {
    return Infinity;
  }

  if (entry.oracle_text === null) return null;

  const unlimited =
    /A deck can have any number of cards named ([^\n]+)\./i.exec(
      entry.oracle_text,
    );

  if (unlimited?.[1].trim().toLowerCase() === entry.name.trim().toLowerCase()) {
    return Infinity;
  }

  const limited =
    /A deck can have up to ([a-z]+|\d+) cards named ([^\n]+)\./i.exec(
      entry.oracle_text,
    );

  if (limited?.[2].trim().toLowerCase() === entry.name.trim().toLowerCase()) {
    const numbers: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
    };

    const limit = numbers[limited[1].toLowerCase()] ?? Number(limited[1]);
    return Number.isInteger(limit) && limit > 0 ? limit : null;
  }

  return 1;
}

function commanderEligibility(
  entry: CheckEntry,
): "eligible" | "ineligible" | "unknown" {
  if (entry.type_line === null || entry.oracle_text === null) {
    return "unknown";
  }

  // Combined face data needs a separate check so a back face does not
  // accidentally qualify a card whose front face cannot be a commander.
  if (entry.type_line.includes(" // ")) return "unknown";

  const [types, subtypes = ""] = entry.type_line.split("—");
  const legendary = /\bLegendary\b/.test(types);

  if (
    entry.oracle_text
      .toLowerCase()
      .includes(`${entry.name.toLowerCase()} can be your commander.`)
  ) {
    return "eligible";
  }

  if (
    legendary &&
    (/\bCreature\b/.test(types) || /\bVehicle\b/.test(subtypes))
  ) {
    return "eligible";
  }

  // Spacecraft need power/toughness information that we do not yet save.
  if (legendary && /\bSpacecraft\b/.test(subtypes)) return "unknown";

  // A legendary Background can qualify through Choose a Background.
  // Check that when validating the commander pair.
  if (
    legendary &&
    /\bEnchantment\b/.test(types) &&
    /\bBackground\b/.test(subtypes)
  ) {
    return "unknown";
  }

  return "ineligible";
}

function commanderPair(
  first: CheckEntry,
  second: CheckEntry,
): "valid" | "invalid" | "unknown" {
  const cards = [first, second];

  if (
    cards.some(
      (card) =>
        card.type_line === null ||
        card.oracle_text === null ||
        card.type_line.includes(" // "),
    )
  ) {
    return "unknown";
  }

  function types(card: CheckEntry) {
    const [main, subtypes = ""] = card.type_line!.split("—");
    return { main, subtypes: subtypes.trim() };
  }

  function abilities(card: CheckEntry) {
    return card
      .oracle_text!.replace(/\([^)]*\)/g, "")
      .split("\n")
      .map((line) => line.trim().toLowerCase().replace(/[’]/g, "'"))
      .filter(Boolean);
  }

  const a = types(first);
  const b = types(second);
  const firstAbilities = abilities(first);
  const secondAbilities = abilities(second);

  if (!/\bLegendary\b/.test(a.main) || !/\bLegendary\b/.test(b.main)) {
    return "invalid";
  }

  const has = (lines: string[], ability: string) => lines.includes(ability);

  if (has(firstAbilities, "partner") && has(secondAbilities, "partner")) {
    return "valid";
  }

  const partnerGroup = (lines: string[]) =>
    lines
      .filter((line) => /^partner\s*—\s*/.test(line))
      .map((line) => line.replace(/^partner\s*—\s*/, ""));

  const firstGroups = partnerGroup(firstAbilities);
  const secondGroups = partnerGroup(secondAbilities);
  const knownGroups = new Set([
    "character select",
    "father & son",
    "friends forever",
    "survivors",
  ]);

  if (
    firstGroups.some(
      (group) => knownGroups.has(group) && secondGroups.includes(group),
    )
  ) {
    return "valid";
  }

  // Also recognize older saved text from before the keyword update.
  if (
    has(firstAbilities, "friends forever") &&
    has(secondAbilities, "friends forever")
  ) {
    return "valid";
  }

  const normalizeName = (name: string) =>
    name.trim().toLowerCase().replace(/[’]/g, "'");

  if (
    has(firstAbilities, `partner with ${normalizeName(second.name)}`) &&
    has(secondAbilities, `partner with ${normalizeName(first.name)}`)
  ) {
    return "valid";
  }

  const isBackground = (type: ReturnType<typeof types>) =>
    /\bEnchantment\b/.test(type.main) && /\bBackground\b/.test(type.subtypes);

  if (
    (has(firstAbilities, "choose a background") && isBackground(b)) ||
    (has(secondAbilities, "choose a background") && isBackground(a))
  ) {
    return "valid";
  }

  const isDoctor = (type: ReturnType<typeof types>) =>
    /\bCreature\b/.test(type.main) &&
    type.subtypes.replace(/\s+/g, " ") === "Time Lord Doctor";

  if (
    /\bCreature\b/.test(a.main) &&
    /\bCreature\b/.test(b.main) &&
    ((has(firstAbilities, "doctor's companion") && isDoctor(b)) ||
      (has(secondAbilities, "doctor's companion") && isDoctor(a)))
  ) {
    return "valid";
  }

  if (
    [...firstGroups, ...secondGroups].some((group) => !knownGroups.has(group))
  ) {
    return "unknown";
  }

  return "invalid";
}

export function checkDeck(entries: readonly CheckEntry[]): DeckCheckResult {
  const active = entries.filter(
    (entry) => entry.card_role === "main" || entry.card_role === "commander",
  );
  const commanders = active.filter((entry) => entry.card_role === "commander");
  const notes: string[] = [];
  const warnings = new Map<string, string[]>();

  function warn(entry: CheckEntry, text: string) {
    const messages = warnings.get(entry.id) ?? [];
    messages.push(text);
    warnings.set(entry.id, messages);
  }

  const count = active.reduce((sum, entry) => sum + entry.quantity, 0);
  notes.push(
    count === 100
      ? "100 cards, including commanders."
      : `${count} / 100 cards, including commanders. ${
          count < 100 ? `${100 - count} more needed.` : `${count - 100} over.`
        }`,
  );

  const pairing =
    commanders.length === 2
      ? commanderPair(commanders[0], commanders[1])
      : null;

  if (commanders.length > 2) {
    for (const commander of commanders) {
      warn(
        commander,
        "More than two commander entries are selected. Normal Commander " +
          "allows one commander or a permitted pair.",
      );
    }
  } else if (pairing === "invalid") {
    for (const commander of commanders) {
      warn(
        commander,
        "These two cards do not form a permitted commander pair under " +
          "the pairing rules checked here. Your pod may allow them by agreement.",
      );
    }
  } else if (pairing === "unknown") {
    for (const commander of commanders) {
      warn(
        commander,
        "Commander pairing needs review because of missing data or " +
          "a special case this checker does not yet verify.",
      );
    }
  } else if (pairing === "valid") {
    notes.push(
      "The two selected commanders have a recognized pairing ability.",
    );
  }

  for (const commander of commanders) {
    if (commander.quantity !== 1) {
      warn(commander, "Each selected commander should have quantity 1.");
    }

    // A valid pairing can qualify a card such as a Background that
    // cannot serve as a commander on its own.
    if (pairing === "valid") continue;

    const eligibility = commanderEligibility(commander);

    if (eligibility === "ineligible") {
      warn(
        commander,
        "This card does not meet the normal commander eligibility rules. " +
          "Your pod may allow it by agreement.",
      );
    } else if (eligibility === "unknown" && pairing !== "unknown") {
      warn(
        commander,
        "Commander eligibility needs review. This card has missing data " +
          "or a special case this checker does not yet verify.",
      );
    }
  }

  const canCheckColors =
    commanders.length > 0 &&
    commanders.every((entry) => Array.isArray(entry.color_identity));

  if (!commanders.length) {
    notes.push("Choose a commander to check color restrictions.");
  } else if (!canCheckColors) {
    notes.push("Refresh commander card data to check color restrictions.");
  }

  const allowedColors = new Set(
    commanders.flatMap((entry) => entry.color_identity ?? []),
  );

  const byName = new Map<string, CheckEntry[]>();
  let missingData = 0;

  for (const entry of active) {
    const key = entry.name.trim().toLowerCase();
    const group = byName.get(key) ?? [];
    group.push(entry);
    byName.set(key, group);

    if (
      entry.type_line === null ||
      entry.oracle_text === null ||
      entry.color_identity === null
    ) {
      missingData++;
    }

    if (!canCheckColors) continue;

    const requiredColors = new Set(entry.color_identity ?? []);

    // Basic land types have their own Commander restriction.
    const typeLine = entry.type_line ?? "";
    const [types, subtypes = ""] = typeLine.split("—");

    if (/\bLand\b/.test(types)) {
      for (const [landType, color] of Object.entries(basicLandColors)) {
        if (subtypes.split(/\s+/).includes(landType)) {
          requiredColors.add(color);
        }
      }
    }

    const outside = [...requiredColors].filter(
      (color) => !allowedColors.has(color),
    );

    if (outside.length) {
      warn(
        entry,
        `Outside commander colors: ${outside
          .map((color) => colorNames[color] ?? color)
          .join(", ")}.`,
      );
    }
  }

  for (const group of byName.values()) {
    const total = group.reduce((sum, entry) => sum + entry.quantity, 0);
    if (total <= 1) continue;

    const limits = group.map(copyLimit);

    if (limits.some((limit) => limit === null)) {
      for (const entry of group) {
        warn(entry, "Refresh card data to check this card’s copy limit.");
      }
      continue;
    }

    const limit = Math.max(...(limits as number[]));

    if (total > limit) {
      for (const entry of group) {
        warn(
          entry,
          `${total} copies across the active deck; allowed: ${limit}. ` +
            "Different printings and finishes count together.",
        );
      }
    }
  }

  if (missingData) {
    notes.push(
      `${missingData} card entries have missing rules, type, or color data. ` +
        "Refresh card data; some checks are incomplete.",
    );
  }

  notes.push(
    "Checks cover deck size, color restrictions, copy limits, basic " +
      "commander eligibility, and recognized commander pairings. " +
      "Some special cases need review. Banned cards are not checked yet.",
    "Warnings do not prevent saving. Your pod can agree to house rules.",
  );

  return { notes, warnings };
}
