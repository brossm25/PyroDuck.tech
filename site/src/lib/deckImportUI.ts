import { sectionFor, sectionNames } from "./deckSections";
import {
  parseCardList,
  type ImportFinish,
  type ImportRole,
} from "./cardImport";

import {
  matchImportRow,
  type ImportCard,
  type ImportMatch,
} from "./cardImportMatch";

export interface ReviewedImport {
  card: ImportCard;
  finish: ImportFinish;
  quantity: number;
  role: ImportRole;
  isProxy: boolean;
}

interface ExistingCard {
  scryfall_id: string;
  finish: string;
  card_role: string;
}

interface Options {
  openCardPreview: (
    entry: {
      name: string;
      finish: string;
      image_url: string | null;
      card_faces: { name: string; image_url: string | null }[] | null;
    },
    trigger: HTMLButtonElement,
  ) => void;
  canEdit: () => boolean;
  existing: () => ExistingCard[];
  save: (cards: ReviewedImport[]) => Promise<void>;
}

interface ReviewRow extends ImportMatch {
  included: boolean;
  isProxy: boolean;
}

export function setupDeckImport(options: Options) {
  const get = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;

  const dialog = get<HTMLDialogElement>("deck-import-dialog");
  const open = get<HTMLButtonElement>("open-deck-import");
  const text = get<HTMLTextAreaElement>("deck-import-text");
  const file = get<HTMLInputElement>("deck-import-file");
  const format = get<HTMLSelectElement>("deck-import-format");
  const preview = get<HTMLButtonElement>("deck-import-preview");
  const cancel = get<HTMLButtonElement>("deck-import-cancel");
  const save = get<HTMLButtonElement>("deck-import-save");
  const status = get<HTMLElement>("deck-import-status");
  const summary = get<HTMLElement>("deck-import-summary");
  const results = get<HTMLUListElement>("deck-import-results");

  let rows: ReviewRow[] = [];
  let controller: AbortController | undefined;
  let working = false;
  let saving = false;
  let generation = 0;

  const pause = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 150));

  function key(id: string, finish: string, role: string) {
    return `${id}|${finish}|${role}`;
  }

  function problem(item: ReviewRow): string | null {
    if (!item.card) return item.issue ?? "Card needs a match.";
    if (!item.finish || !item.card.finishes.includes(item.finish)) {
      return "Choose an available finish.";
    }

    if (
      !Number.isInteger(item.row.quantity) ||
      item.row.quantity < 1 ||
      item.row.quantity > 1000
    ) {
      return "Quantity must be 1–1000.";
    }

    const itemKey = key(item.card.id, item.finish, item.row.role);

    if (
      options
        .existing()
        .some(
          (entry) =>
            key(entry.scryfall_id, entry.finish, entry.card_role) === itemKey,
        )
    ) {
      return "Already in this deck. Uncheck this row and edit its existing quantity.";
    }

    if (
      rows.some(
        (other) =>
          other !== item &&
          other.included &&
          other.card &&
          other.finish &&
          key(other.card.id, other.finish, other.row.role) === itemKey,
      )
    ) {
      return "Repeated in this import. Keep one row and adjust its quantity.";
    }

    return null;
  }

  function update() {
    open.disabled = !options.canEdit() || working || saving;

    dialog
      .querySelectorAll<
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
      >("button, input, textarea, select")
      .forEach((element) => {
        element.disabled = working || saving || !options.canEdit();
      });

    cancel.hidden = !working || saving;
    cancel.disabled = !working || saving;
    get("deck-import-bulk").hidden = rows.length === 0;

    const included = rows.filter((item) => item.included);
    const problems = included.filter((item) => problem(item));
    const copies = included.reduce((sum, item) => sum + item.row.quantity, 0);

    summary.textContent = rows.length
      ? `${included.length} selected entries · ${copies} copies · ` +
        `${problems.length} entries need attention.`
      : "";

    for (const [index, item] of rows.entries()) {
      const warning = results.querySelector<HTMLElement>(
        `[data-warning="${index}"]`,
      );
      if (warning) warning.textContent = problem(item) ?? "";
    }

    save.disabled =
      working ||
      saving ||
      !options.canEdit() ||
      included.length === 0 ||
      problems.length > 0;
  }

  function selectControl(
    labelText: string,
    values: [string, string][],
    value: string,
    changed: (value: string) => void,
  ) {
    const label = document.createElement("label");
    label.append(document.createTextNode(labelText));

    const select = document.createElement("select");
    for (const [id, name] of values) {
      select.add(new Option(name, id));
    }
    select.value = value;
    select.addEventListener("change", () => {
      changed(select.value);
      update();
    });

    label.append(select);
    return label;
  }

  function render() {
    results.replaceChildren();

    const order = ["Commanders", ...sectionNames];

    const displayedRows = rows.map((item, index) => ({
      item,
      index,
      section: sectionFor({
        card_role: item.row.role,
        type_line: item.card?.type_line ?? null,
      }),
    }));

    displayedRows.sort((a, b) => {
      const sectionDifference =
        order.indexOf(a.section) - order.indexOf(b.section);

      if (sectionDifference !== 0) return sectionDifference;

      const nameA = a.item.card?.name ?? a.item.row.name;
      const nameB = b.item.card?.name ?? b.item.row.name;
      return nameA.localeCompare(nameB) || a.index - b.index;
    });

    let previousSection = "";

    displayedRows.forEach(({ item, index, section }) => {
      if (section !== previousSection) {
        const heading = document.createElement("li");
        heading.className = "import-section-heading";
        heading.textContent = section;
        results.append(heading);
        previousSection = section;
      }

      const li = document.createElement("li");
      const included = document.createElement("input");
      included.type = "checkbox";
      included.checked = item.included;
      included.addEventListener("change", () => {
        item.included = included.checked;
        update();
      });

      const title = document.createElement("label");
      title.append(
        included,
        document.createTextNode(item.card?.name ?? item.row.name),
      );
      li.append(title);

      const imageUrl =
        item.card?.image_uris?.normal ??
        item.card?.card_faces?.[0]?.image_uris?.normal;

      if (imageUrl) {
        try {
          const url = new URL(imageUrl);
          if (
            url.protocol === "https:" &&
            url.hostname === "cards.scryfall.io"
          ) {
            const image = document.createElement("img");
            image.src = url.href;
            image.alt = item.card?.name ?? item.row.name;
            image.width = 488;
            image.height = 680;
            image.loading = "lazy";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "import-image-preview";
            button.setAttribute("aria-label", `Enlarge ${image.alt}`);
            button.setAttribute("aria-haspopup", "dialog");

            button.addEventListener("click", () => {
              const card = item.card;
              if (!card) return;

              options.openCardPreview(
                {
                  name: card.name,
                  finish: item.finish ?? "nonfoil",
                  image_url: imageUrl,
                  card_faces: (card.card_faces ?? []).map((face) => ({
                    name: face.name ?? card.name,
                    image_url: face.image_uris?.normal ?? null,
                  })),
                },
                button,
              );
            });

            button.append(image);
            li.append(button);
          }
        } catch {
          // A missing image does not prevent reviewing the card.
        }
      }

      const detail = document.createElement("p");
      detail.textContent = item.card
        ? `${item.card.set_name} #${item.card.collector_number}` +
          (item.automaticPrinting ? " · Automatically selected printing" : "")
        : `Source line/row ${item.row.line}: ${item.issue}`;
      li.append(detail);

      const warning = document.createElement("p");
      warning.className = "import-warning";
      warning.dataset.warning = String(index);
      li.append(warning);

      const controls = document.createElement("div");
      controls.className = "import-row-controls";

      const quantityLabel = document.createElement("label");
      quantityLabel.textContent = "Quantity";
      const quantity = document.createElement("input");
      quantity.type = "number";
      quantity.min = "1";
      quantity.max = "1000";
      quantity.step = "1";
      quantity.value = String(item.row.quantity);
      quantity.addEventListener("input", () => {
        item.row.quantity = Number(quantity.value);
        update();
      });
      quantityLabel.append(quantity);
      controls.append(quantityLabel);

      controls.append(
        selectControl(
          "Deck section",
          [
            ["main", "Main deck"],
            ["commander", "Commander"],
            ["sideboard", "Sideboard"],
            ["maybeboard", "Maybeboard"],
          ],
          item.row.role,
          (value) => {
            item.row.role = value as ImportRole;
          },
        ),
        selectControl(
          "Real or proxy",
          [
            ["real", "Real"],
            ["proxy", "Proxy"],
          ],
          item.isProxy ? "proxy" : "real",
          (value) => {
            item.isProxy = value === "proxy";
          },
        ),
      );

      if (item.card) {
        const finishes = item.card.finishes.filter((value) =>
          ["nonfoil", "foil", "etched"].includes(value),
        );

        controls.append(
          selectControl(
            "Finish",
            [
              ["", "Choose finish"],
              ...finishes.map((value): [string, string] => [
                value,
                value === "etched"
                  ? "Etched foil"
                  : value === "foil"
                    ? "Foil"
                    : "Nonfoil",
              ]),
            ],
            item.finish ?? "",
            (value) => {
              item.finish = value ? (value as ImportFinish) : null;
            },
          ),
        );

        const versions = document.createElement("button");
        versions.type = "button";
        versions.textContent = "Change printing / art";
        versions.addEventListener("click", () => {
          void loadVersions(item, li);
        });
        controls.append(versions);
      }

      li.append(controls);
      results.append(li);
    });

    update();
  }

  async function loadVersions(item: ReviewRow, container: HTMLElement) {
    if (!item.card || working || saving || !options.canEdit()) return;

    const current = generation;
    const previousFinish = item.finish;
    const abort = new AbortController();
    controller = abort;
    working = true;
    update();
    status.textContent = `Loading printings of ${item.card.name}…`;

    try {
      const endpoint = new URL(item.card.prints_search_uri);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.hostname !== "api.scryfall.com"
      )
        throw new Error("Invalid printing lookup URL.");

      endpoint.searchParams.set(
        "q",
        `(${endpoint.searchParams.get("q") ?? ""}) game:paper`,
      );
      endpoint.searchParams.set("unique", "prints");

      let next: string | undefined = endpoint.href;
      const cards: ImportCard[] = [];

      while (next) {
        const url = new URL(next);
        if (url.protocol !== "https:" || url.hostname !== "api.scryfall.com") {
          throw new Error("Invalid printing lookup URL.");
        }

        const response = await fetch(url, {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
          headers: { Accept: "application/json" },
        });

        if (!response.ok)
          throw new Error("Couldn’t load printings. Retry shortly.");

        const page = await response.json();
        cards.push(...page.data);
        next = page.has_more ? page.next_page : undefined;
        if (next) await pause();
        abort.signal.throwIfAborted();
      }

      if (current !== generation) return;

      container.querySelector(".import-printing-choice")?.remove();

      const choice = selectControl(
        "Choose art / printing",
        [
          ["", "Select a printing"],
          ...cards.map((card, index): [string, string] => [
            String(index),
            `${card.set_name} #${card.collector_number}`,
          ]),
        ],
        "",
        (value) => {
          if (value === "") return;
          item.card = cards[Number(value)];
          item.automaticPrinting = false;
          item.finish =
            previousFinish && item.card.finishes.includes(previousFinish)
              ? previousFinish
              : null;
          item.issue = null;
          render();
        },
      );

      choice.classList.add("import-printing-choice");
      container.append(choice);
      status.textContent =
        "Choose a printing, then check its image and finish.";
    } catch (error) {
      if (current === generation && !abort.signal.aborted) {
        status.textContent =
          error instanceof Error ? error.message : "Couldn’t load printings.";
      }
    } finally {
      if (current === generation) {
        working = false;
        update();
      }
    }
  }

  function reset() {
    generation++;
    controller?.abort();
    rows = [];
    working = false;
    results.replaceChildren();
    status.textContent = "";
    summary.textContent = "";
    if (dialog.open) dialog.close();
    update();
  }

  open.addEventListener("click", () => {
    if (!options.canEdit() || working || saving) return;
    dialog.showModal();
    update();
  });

  dialog.addEventListener("cancel", (event) => {
    if (saving) event.preventDefault();
  });

  dialog.addEventListener("submit", (event) => {
    if (saving) event.preventDefault();
  });

  dialog.addEventListener("close", () => {
    generation++;
    controller?.abort();
    working = false;
    update();
  });

  cancel.addEventListener("click", () => {
    generation++;
    controller?.abort();
    working = false;
    rows = [];
    render();
    status.textContent = "Lookup canceled. Nothing was saved.";
  });

  function invalidate() {
    rows = [];
    results.replaceChildren();
    status.textContent = "Preview the updated list before saving.";
    update();
  }

  text.addEventListener("input", invalidate);
  format.addEventListener("change", invalidate);

  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected || working || saving) return;

    const current = generation;
    if (selected.size > 1_000_000) {
      status.textContent = "Choose a file smaller than 1 MB.";
      return;
    }

    try {
      const contents = await selected.text();
      if (current !== generation || !options.canEdit()) return;
      text.value = contents;
      format.value = selected.name.toLowerCase().endsWith(".csv")
        ? "csv"
        : "text";
      invalidate();
    } catch {
      status.textContent = "Couldn’t read this file.";
    }
  });

  preview.addEventListener("click", async () => {
    if (working || saving || !options.canEdit()) return;

    const parsed = parseCardList(
      text.value,
      format.value === "csv" ? "csv" : "text",
    );

    rows = [];
    render();

    if (parsed.issues.length) {
      status.textContent = parsed.issues.join("\n");
      return;
    }

    const current = ++generation;
    const abort = new AbortController();
    controller = abort;
    working = true;
    update();

    try {
      const matches: ReviewRow[] = [];

      for (const [index, row] of parsed.rows.entries()) {
        abort.signal.throwIfAborted();
        status.textContent = `Matching ${index + 1} of ${parsed.rows.length}: ${row.name}`;

        const matched = await matchImportRow(row, abort.signal);
        if (current !== generation) return;

        matches.push({
          ...matched,
          included: true,
          isProxy: row.isProxy ?? false,
        });

        if (index < parsed.rows.length - 1) await pause();
      }

      if (current !== generation) return;

      rows = matches;
      status.textContent =
        "Review the cards below. Uncheck unresolved or unwanted entries. " +
        "To correct an unmatched name, edit the source list and preview again.";
    } catch (error) {
      if (current === generation && !abort.signal.aborted) {
        status.textContent =
          error instanceof Error ? error.message : "Card lookup failed.";
      }
    } finally {
      if (current === generation) {
        working = false;
        render();
      }
    }
  });

  save.addEventListener("click", async () => {
    if (working || saving || !options.canEdit()) return;
    const included = rows.filter((item) => item.included);
    if (!included.length || included.some((item) => problem(item))) return;

    const reviewed: ReviewedImport[] = included.map((item) => ({
      card: item.card!,
      finish: item.finish!,
      quantity: item.row.quantity,
      role: item.row.role,
      isProxy: item.isProxy,
    }));

    const current = generation;
    saving = true;
    update();
    status.textContent = "Saving reviewed cards…";

    try {
      await options.save(reviewed);
      if (current !== generation) return;
      rows = [];
      text.value = "";
      file.value = "";
      format.value = "text";
      render();
      status.textContent = "";
      dialog.close();
    } catch (error) {
      if (current === generation) {
        status.textContent =
          error instanceof Error ? error.message : "Couldn’t save the import.";
      }
    } finally {
      saving = false;
      update();
    }
  });

  function markAll(isProxy: boolean) {
    if (working || saving || !options.canEdit()) return;

    for (const item of rows) {
      item.isProxy = isProxy;
    }

    render();
    status.textContent =
      `All preview entries marked ${isProxy ? "Proxy" : "Real"}. ` +
      "You can still change individual entries before saving.";
  }

  get("deck-import-all-real").addEventListener("click", () => {
    markAll(false);
  });

  get("deck-import-all-proxy").addEventListener("click", () => {
    markAll(true);
  });

  update();
  return { sync: update, reset };
}
