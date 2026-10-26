import {
  comboNameKey,
  findCardCombosPage,
  findDeckCombosPage,
  type ComboEntry,
  type SpellbookCombo,
} from "@/lib/deckCombos";

let currentController: AbortController | undefined;
let currentRoot: HTMLElement | undefined;

export function resetDeckCombos() {
  currentController?.abort();
  currentController = undefined;
  currentRoot?.remove();
  currentRoot = undefined;
}

export function renderDeckCombos(
  parent: HTMLElement,
  entries: readonly ComboEntry[],
  isCurrent: () => boolean,
) {
  resetDeckCombos();

  const controller = new AbortController();
  currentController = controller;

  const root = document.createElement("section");
  currentRoot = root;
  parent.append(root);

  const current = () =>
    !controller.signal.aborted && root.isConnected && isCurrent();

  const active = entries.filter(
    (entry) => entry.card_role === "main" || entry.card_role === "commander",
  );

  const quantities = new Map<string, number>();
  const commanders = new Set<string>();

  for (const entry of active) {
    const key = comboNameKey(entry.name);
    quantities.set(key, (quantities.get(key) ?? 0) + entry.quantity);
    if (entry.card_role === "commander") commanders.add(key);
  }

  function note(parent: HTMLElement, text: string) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    parent.append(paragraph);
  }

  function button(parent: HTMLElement, text: string) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function group(label: string) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = label;
    details.append(summary);
    root.append(details);
    return details;
  }

  const sizeFilter = document.createElement("select");
  sizeFilter.setAttribute("aria-label", "Filter combos by size");
  sizeFilter.add(new Option("All combo sizes", "all"));
  sizeFilter.add(new Option("2 cards · no additional card templates", "two"));
  sizeFilter.add(new Option("3+ cards / additional card templates", "larger"));

  function applySizeFilter() {
    root
      .querySelectorAll<HTMLDetailsElement>("[data-combo-size]")
      .forEach((details) => {
        details.hidden =
          sizeFilter.value !== "all" &&
          details.dataset.comboSize !== sizeFilter.value;
      });

    root
      .querySelectorAll<HTMLDetailsElement>("[data-combo-group]")
      .forEach((group) => {
        const summary = group.querySelector("summary");
        const list = group.querySelector<HTMLElement>("[data-combo-list]");
        if (!summary || !list) return;

        const rows = Array.from(list.children) as HTMLDetailsElement[];
        const visible = rows.filter((row) => !row.hidden).length;

        summary.textContent =
          `${group.dataset.comboGroup}: ${visible} shown / ` +
          `${rows.length} loaded`;
      });
  }

  sizeFilter.addEventListener("change", applySizeFilter);

  function showCombo(
    parent: HTMLElement,
    combo: SpellbookCombo,
    classification: string,
  ) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = combo.uses
      .map(
        (use) =>
          `${use.quantity > 1 ? `${use.quantity} × ` : ""}${use.card.name}`,
      )
      .join(" + ");
    details.append(summary);

    note(details, classification);

    const missing: string[] = [];

    for (const use of combo.uses) {
      const key = comboNameKey(use.card.name);
      const shortage = use.quantity - (quantities.get(key) ?? 0);

      if (shortage > 0) {
        missing.push(`${shortage} × ${use.card.name}`);
      }

      if (use.mustBeCommander && !commanders.has(key)) {
        missing.push(`${use.card.name} must be a commander`);
      }
    }

    const namedCopies = combo.uses.reduce(
      (total, use) => total + use.quantity,
      0,
    );

    details.dataset.comboSize =
      namedCopies === 2 && combo.requires.length === 0 ? "two" : "larger";

    const badge = document.createElement("span");
    badge.style.display = "block";
    badge.style.marginTop = "0.35rem";

    if (missing.length) {
      badge.textContent = `Needs: ${missing.join("; ")}`;
      badge.style.color = "var(--color-brand-muted)";
    } else if (combo.requires.length) {
      badge.textContent = "Named cards in deck · additional pieces need review";
      badge.style.color = "var(--color-pyroduck-plasma)";
    } else {
      badge.textContent = "All listed cards in deck · review setup";
      badge.style.color = "var(--color-pyroduck-lime)";
    }

    summary.append(badge);

    if (missing.length) {
      note(details, `Missing / needs changing: ${missing.join("; ")}.`);
    }

    if (combo.requires.length) {
      note(
        details,
        "Additional requirements: " +
          combo.requires
            .map(
              (requirement) =>
                `${requirement.quantity} × ${requirement.template.name}`,
            )
            .join("; "),
      );
    }

    note(
      details,
      "Result: " +
        combo.produces.map((result) => result.feature.name).join("; "),
    );

    if (combo.manaNeeded) {
      note(details, `Starting mana: ${combo.manaNeeded}`);
    }

    for (const use of combo.uses) {
      const states = [
        ["Battlefield", use.battlefieldCardState],
        ["Exile", use.exileCardState],
        ["Library", use.libraryCardState],
        ["Graveyard", use.graveyardCardState],
      ].filter(([, text]) => Boolean(text));

      for (const [zone, text] of states) {
        note(details, `${use.card.name} — ${zone}: ${text}`);
      }
    }

    if (combo.easyPrerequisites) {
      note(details, combo.easyPrerequisites);
    }
    if (combo.notablePrerequisites) {
      note(details, combo.notablePrerequisites);
    }

    const explanation = document.createElement("p");
    explanation.style.whiteSpace = "pre-line";
    explanation.textContent = combo.description;
    details.append(explanation);

    if (combo.notes) note(details, combo.notes);

    const link = document.createElement("a");
    link.href = `https://commanderspellbook.com/combo/${encodeURIComponent(combo.id)}/`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View requirements and steps on Commander Spellbook ↗";
    details.append(link);

    parent.append(details);
    applySizeFilter();
  }

  const heading = document.createElement("h3");
  heading.textContent = "Combos";
  root.append(heading);

  note(
    root,
    "Look up known combos using commanders and main-deck cards, including " +
      "proxies. A match does not mean it is ready to execute: review its " +
      "mana, zones, and other requirements. Lookups send card names and " +
      "quantities to Commander Spellbook.",
  );

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  root.append(status);

  const filterLabel = document.createElement("label");
  filterLabel.textContent = "Combo size ";
  filterLabel.append(sizeFilter);
  root.append(filterLabel);

  note(
    root,
    "The size filter applies to loaded results in both sections. " +
      "Load more to check additional results. Different recorded versions " +
      "of a combination may appear separately.",
  );

  const deckButton = button(root, "Find combos in this deck");

  const deckResults = group("Deck combo results · not checked");
  const deckSummary = deckResults.querySelector("summary")!;
  function resultGroup(label: string, open = false) {
    const details = document.createElement("details");
    details.dataset.comboGroup = label;
    details.open = open;

    const summary = document.createElement("summary");
    summary.textContent = `${label}: 0 loaded`;

    const list = document.createElement("div");
    list.dataset.comboList = "true";

    details.append(summary, list);
    deckResults.append(details);

    return list;
  }

  const includedList = resultGroup("All listed cards in deck", true);
  const missingList = resultGroup("Missing pieces / commander changes");
  const reviewList = resultGroup("Additional card requirements to review");

  let deckNext: string | null = null;
  let deckCount = 0;
  const deckSeen = new Set<string>();
  const moreDeck = button(deckResults, "Load more deck results");
  moreDeck.hidden = true;

  async function loadDeck(next?: string | null) {
    deckButton.disabled = true;
    moreDeck.disabled = true;
    status.textContent = "Looking up deck combos…";

    try {
      const page = await findDeckCombosPage(active, controller.signal, next);
      if (!current()) return;

      const categories = [
        ["All listed cards included; review setup", page.results.included],
        ["Missing one card; within deck colors", page.results.almostIncluded],
        [
          "Missing one card; adds colors",
          page.results.almostIncludedByAddingColors,
        ],
        [
          "Requires changing commanders",
          page.results.includedByChangingCommanders,
        ],
        [
          "Missing a card and requires changing commanders",
          page.results.almostIncludedByChangingCommanders,
        ],
        [
          "Missing a card, adds colors, and requires changing commanders",
          page.results.almostIncludedByAddingColorsAndChangingCommanders,
        ],
      ] as const;

      for (const [index, [label, combos]] of categories.entries()) {
        for (const combo of combos) {
          if (deckSeen.has(combo.id)) continue;
          deckSeen.add(combo.id);

          const destination =
            index !== 0
              ? missingList
              : combo.requires.length
                ? reviewList
                : includedList;

          showCombo(destination, combo, label);
          deckCount++;
        }
      }

      applySizeFilter();

      deckNext = page.next;
      moreDeck.hidden = !deckNext;
      deckSummary.textContent =
        `Deck combo results: ${deckCount} loaded` +
        (deckNext ? " · more available" : "");
      deckResults.open = true;
      status.textContent = deckCount
        ? "Deck results loaded. Expand a combination to review it."
        : "No matching combos returned. This does not prove the deck has no combos.";
      deckButton.hidden = true;
    } catch (error) {
      if (current()) {
        status.textContent =
          error instanceof Error ? error.message : "Couldn’t load combos.";
      }
    } finally {
      if (current()) {
        deckButton.disabled = false;
        moreDeck.disabled = false;
      }
    }
  }

  deckButton.addEventListener("click", () => void loadDeck());
  moreDeck.addEventListener("click", () => {
    if (deckNext) void loadDeck(deckNext);
  });

  const browse = group("Browse combos for a card in this deck");
  const label = document.createElement("label");
  label.textContent = "Choose a card ";
  const select = document.createElement("select");

  const names = [...new Set(active.map((entry) => entry.name))].sort((a, b) =>
    a.localeCompare(b),
  );

  for (const name of names) {
    select.add(new Option(name, name));
  }

  label.append(select);
  browse.append(label);

  const cardButton = button(browse, "Show this card’s combos");
  cardButton.disabled = !names.length;

  const cardList = document.createElement("div");
  browse.append(cardList);
  const moreCard = button(browse, "Load more for this card");
  moreCard.hidden = true;

  let cardNext: string | null = null;
  let searchedName = "";
  const cardSeen = new Set<string>();

  async function loadCard(next?: string | null) {
    const name = next ? searchedName : select.value;
    if (!name) return;

    if (!next) {
      searchedName = name;
      cardSeen.clear();
      cardList.replaceChildren();
      moreCard.hidden = true;
    }

    select.disabled = true;
    cardButton.disabled = true;
    moreCard.disabled = true;
    status.textContent = `Looking up combos for ${name}…`;

    try {
      const page = await findCardCombosPage(name, controller.signal, next);
      if (!current()) return;

      for (const combo of page.results) {
        if (cardSeen.has(combo.id)) continue;
        cardSeen.add(combo.id);
        showCombo(
          cardList,
          combo,
          "Card combo browsing result; review missing pieces and setup.",
        );
      }

      cardNext = page.next;
      moreCard.hidden = !cardNext;
      status.textContent =
        `${cardSeen.size} recorded combinations loaded for ${name}.` +
        (cardNext ? " More are available." : "");
    } catch (error) {
      if (current()) {
        status.textContent =
          error instanceof Error ? error.message : "Couldn’t load combos.";
      }
    } finally {
      if (current()) {
        select.disabled = false;
        cardButton.disabled = false;
        moreCard.disabled = false;
      }
    }
  }

  select.addEventListener("change", () => {
    cardNext = null;
    moreCard.hidden = true;
    cardList.replaceChildren();
    status.textContent = "Select Show this card’s combos to load results.";
  });

  cardButton.addEventListener("click", () => void loadCard());
  moreCard.addEventListener("click", () => {
    if (cardNext) void loadCard(cardNext);
  });

  const credit = document.createElement("a");
  credit.href = "https://commanderspellbook.com";
  credit.target = "_blank";
  credit.rel = "noopener noreferrer";
  credit.textContent = "Combo data provided by Commander Spellbook ↗";
  root.append(credit);
}
