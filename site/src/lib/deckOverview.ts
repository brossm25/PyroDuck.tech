import { effectivePrice, money, quantityOf } from "@/lib/mtgFormat";

interface OverviewEntry {
  quantity: number;
  card_role: string;
  is_proxy: boolean;
  type_line: string | null;
  mana_value: number | null;
  price_usd: number | string | null;
  manual_price_usd: number | string | null;
  price_checked_at: string | null;
}

interface OverviewOptions<T> {
  overview: HTMLElement;
  value: HTMLElement;
  mana: HTMLElement;
  sectionNames: readonly string[];
  sectionFor: (entry: T) => string;
  openMissingPrices: (label: string, cards: T[]) => void;
}

function addStat(parent: HTMLElement, label: string, value: string) {
  const row = document.createElement("div");
  row.className = "stat-row";

  const name = document.createElement("span");
  name.textContent = label;

  const amount = document.createElement("strong");
  amount.textContent = value;

  row.append(name, amount);
  parent.append(row);
}

function addNote(parent: HTMLElement, text: string) {
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = text;
  parent.append(note);
}

export function renderDeckOverview<T extends OverviewEntry>(
  entries: T[],
  {
    overview,
    value,
    mana,
    sectionNames,
    sectionFor,
    openMissingPrices,
  }: OverviewOptions<T>,
) {
  const active = entries.filter(
    (entry) => entry.card_role === "main" || entry.card_role === "commander",
  );
  const owned = active.filter((entry) => !entry.is_proxy);
  const proxies = active.filter((entry) => entry.is_proxy);

  overview.replaceChildren();
  value.replaceChildren();
  mana.replaceChildren();

  addStat(
    overview,
    "Deck cards, including commanders",
    String(quantityOf(active)),
  );
  addStat(overview, "Owned cards", String(quantityOf(owned)));
  addStat(overview, "Proxies", String(quantityOf(proxies)));

  for (const section of ["Commanders", ...sectionNames]) {
    const count = quantityOf(
      entries.filter((entry) => sectionFor(entry) === section),
    );
    if (count || !["Other", "Sideboard", "Maybeboard"].includes(section)) {
      addStat(overview, section, String(count));
    }
  }

  const unknownTypes = quantityOf(active.filter((entry) => !entry.type_line));
  if (unknownTypes) {
    addNote(
      overview,
      `${unknownTypes} cards need type data. Refresh card data to classify them.`,
    );
  }

  function valueRow(label: string, cards: T[]) {
    let total = 0;
    let missing = 0;
    let priced = 0;
    let estimated = 0;

    for (const entry of cards) {
      const price = effectivePrice(entry);

      if (price.amount === null) {
        missing += entry.quantity;
      } else {
        priced += entry.quantity;
        total += price.amount * entry.quantity;

        if (price.manual) {
          estimated += entry.quantity;
        }
      }
    }

    addStat(
      value,
      label,
      !cards.length
        ? money(0)
        : !priced
          ? "Unavailable"
          : `${money(total)}${missing ? " · partial" : ""}`,
    );

    if (missing) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "missing-price-link";
      button.textContent =
        `${missing} ${missing === 1 ? "card has" : "cards have"} ` +
        "no price available. View cards →";
      button.setAttribute("aria-haspopup", "dialog");
      button.addEventListener("click", () => openMissingPrices(label, cards));
      value.append(button);
    }

    if (estimated) {
      addNote(
        value,
        `Includes your manual estimates for ${estimated} ${
          estimated === 1 ? "card" : "cards"
        }.`,
      );
    }
  }

  valueRow("Full deck, if all cards were real", active);
  valueRow("Owned cards", owned);
  valueRow("Proxy replacement value", proxies);

  addNote(
    value,
    "USD estimates use the selected printing and finish. Sideboard and maybeboard are excluded. Prices are references, not purchase or sale guarantees.",
  );

  const dates = active
    .map((entry) => entry.price_checked_at)
    .filter((date): date is string => Boolean(date))
    .map((date) => new Date(date).getTime())
    .filter(Number.isFinite);

  if (dates.length) {
    addNote(
      value,
      `Oldest price check: ${new Date(Math.min(...dates)).toLocaleString()}`,
    );
  }

  const known = active.filter((entry) => {
    const type = (entry.type_line ?? "").split(" // ")[0].split("—")[0];
    return (
      Boolean(entry.type_line) &&
      !/\bLand\b/.test(type) &&
      entry.mana_value !== null &&
      entry.mana_value !== undefined &&
      Number.isFinite(Number(entry.mana_value))
    );
  });

  const knownCount = quantityOf(known);
  const curve = Array<number>(8).fill(0);
  let totalMana = 0;

  for (const entry of known) {
    const manaValue = Number(entry.mana_value);
    const bucket = Math.min(7, Math.max(0, Math.floor(manaValue)));
    curve[bucket] += entry.quantity;
    totalMana += manaValue * entry.quantity;
  }

  addStat(
    mana,
    "Average mana value · nonlands",
    knownCount ? (totalMana / knownCount).toFixed(2) : "Unavailable",
  );

  const chart = document.createElement("div");
  chart.className = "mana-curve";
  const maximum = Math.max(1, ...curve);

  curve.forEach((count, index) => {
    const column = document.createElement("div");
    column.className = "curve-column";
    column.setAttribute(
      "aria-label",
      `Mana value ${index === 7 ? "7 or more" : index}: ${count} cards`,
    );

    const number = document.createElement("span");
    number.textContent = String(count);

    const track = document.createElement("div");
    track.className = "curve-track";

    const bar = document.createElement("div");
    bar.className = "curve-bar";
    bar.style.height = `${(count / maximum) * 100}%`;
    track.append(bar);

    const label = document.createElement("span");
    label.textContent = index === 7 ? "7+" : String(index);

    column.append(number, track, label);
    chart.append(column);
  });

  mana.append(chart);
  addNote(
    mana,
    "Includes owned cards, proxies, and commanders. Excludes lands, sideboard, maybeboard, and cards missing type or mana data.",
  );
}
