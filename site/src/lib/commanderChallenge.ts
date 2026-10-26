import { supabase } from "@/lib/supabase";
import { safeCardImage } from "@/lib/mtgFormat";
import { renderManaCost } from "@/lib/renderManaCost";

interface ChallengeDeck {
  id: string;
  name: string;
}

interface ChallengePreview {
  unavailable: boolean;
  cards: {
    name: string;
    image_url: string | null;
    card_role: string;
    color_identity: string[] | null;
  }[];
}

interface Selection {
  color_identity: string;
  deck_id: string;
}

const colors = ["W", "U", "B", "R", "G"] as const;
const colorNames = ["White", "Blue", "Black", "Red", "Green"];

const identityNames: Record<string, string> = {
  WU: "Azorius",
  WB: "Orzhov",
  WR: "Boros",
  WG: "Selesnya",
  UB: "Dimir",
  UR: "Izzet",
  UG: "Simic",
  BR: "Rakdos",
  BG: "Golgari",
  RG: "Gruul",
  WUB: "Esper",
  WUR: "Jeskai",
  WUG: "Bant",
  WBR: "Mardu",
  WBG: "Abzan",
  WRG: "Naya",
  UBR: "Grixis",
  UBG: "Sultai",
  URG: "Temur",
  BRG: "Jund",
  WUBR: "Yore-Tiller",
  WUBG: "Witch-Maw",
  WURG: "Ink-Treader",
  WBRG: "Dune-Brood",
  UBRG: "Glint-Eye",
  WUBRG: "Five-color",
};

let generation = 0;

export function resetCommanderChallenge(container: HTMLElement) {
  generation++;
  container.replaceChildren();
  container.hidden = true;
}

function deckIdentity(preview?: ChallengePreview): string | null {
  if (!preview || preview.unavailable) return null;

  const commanders = preview.cards.filter(
    (card) => card.card_role === "commander",
  );

  if (
    !commanders.length ||
    commanders.some(
      (card) =>
        !Array.isArray(card.color_identity) ||
        card.color_identity.some(
          (color) => !colors.includes(color as (typeof colors)[number]),
        ),
    )
  ) {
    return null;
  }

  const identity = new Set(
    commanders.flatMap((card) => card.color_identity ?? []),
  );

  return colors.filter((color) => identity.has(color)).join("") || "C";
}

export async function renderCommanderChallenge(
  container: HTMLElement,
  decks: readonly ChallengeDeck[],
  previews: ReadonlyMap<string, ChallengePreview>,
  userId: string,
  isCurrent: () => boolean,
) {
  const currentGeneration = ++generation;
  const current = () => currentGeneration === generation && isCurrent();

  container.hidden = false;
  container.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "32-deck challenge";

  const explanation = document.createElement("p");
  explanation.textContent =
    "See every deck matching each exact commander color identity. " +
    "Choose one main challenge deck per identity. Both commanders’ colors " +
    "are combined. Choosing a main deck marks that slot; it does not certify legality.";

  const progress = document.createElement("p");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Loading your main challenge decks…";

  const grid = document.createElement("div");
  grid.className = "challenge-grid";

  container.append(heading, explanation, progress, status, grid);

  const byIdentity = new Map<string, ChallengeDeck[]>();
  let unknown = 0;

  for (const deck of decks) {
    const identity = deckIdentity(previews.get(deck.id));

    if (identity === null) {
      unknown++;
      continue;
    }

    const matches = byIdentity.get(identity) ?? [];
    matches.push(deck);
    byIdentity.set(identity, matches);
  }

  const slots = Array.from({ length: 32 }, (_, mask) => {
    const included = colors.filter((_, index) => mask & (1 << index));
    const key = included.join("") || "C";
    const colorLabel = included.length
      ? included.map((color) => colorNames[colors.indexOf(color)]).join(" / ")
      : "Colorless";

    return {
      key,
      count: included.length,
      colorLabel,
      label: identityNames[key]
        ? `${identityNames[key]} · ${colorLabel}`
        : colorLabel,
    };
  }).sort(
    (a, b) => a.count - b.count || a.colorLabel.localeCompare(b.colorLabel),
  );

  const selections = new Map<string, string>();
  let busy = false;

  function render() {
    grid.replaceChildren();
    let completed = 0;

    for (const slot of slots) {
      const matches = [...(byIdentity.get(slot.key) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      const savedId = selections.get(slot.key);
      const selected = matches.find((deck) => deck.id === savedId);
      if (selected) completed++;

      const details = document.createElement("details");
      details.className = "challenge-slot";
      details.dataset.selected = String(Boolean(selected));

      const summary = document.createElement("summary");

      const artwork = document.createElement("span");
      artwork.className = "challenge-artwork";

      const commanders = selected
        ? (previews.get(selected.id)?.cards ?? [])
            .filter((card) => card.card_role === "commander")
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];

      for (const commander of commanders) {
        const imageUrl = safeCardImage(commander.image_url);
        if (!imageUrl) continue;

        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = commander.name;
        image.loading = "lazy";
        image.width = 488;
        image.height = 680;
        artwork.append(image);
      }

      if (!artwork.children.length) {
        const placeholder = document.createElement("span");
        placeholder.className = "challenge-art-placeholder";
        placeholder.textContent = selected
          ? "Commander artwork unavailable"
          : "Choose your main deck";
        artwork.append(placeholder);
      }

      const caption = document.createElement("span");
      caption.className = "challenge-caption";

      const identity = document.createElement("strong");
      identity.className = "challenge-identity";
      const identityName = document.createElement("span");
      identityName.textContent = identityNames[slot.key] ?? slot.colorLabel;

      const symbols = document.createElement("span");
      symbols.className = "challenge-mana";
      renderManaCost(
        symbols,
        [...slot.key].map((color) => `{${color}}`).join(""),
      );
      symbols.setAttribute("role", "img");
      symbols.setAttribute("aria-label", slot.colorLabel);

      identity.append(identityName, document.createTextNode(" · "), symbols);

      const mainName = document.createElement("span");
      mainName.className = "challenge-main-name";
      mainName.textContent = selected?.name ?? "No main deck selected";

      const count = document.createElement("span");
      count.className = "challenge-match-count";
      count.textContent = `${matches.length} matching ${matches.length === 1 ? "deck" : "decks"}`;

      const hint = document.createElement("span");
      hint.className = "challenge-expand-hint";
      hint.textContent = "View decks / change main ▾";

      caption.append(identity, mainName, count, hint);
      summary.append(artwork, caption);
      details.append(summary);

      if (matches.length) {
        const list = document.createElement("ul");

        for (const deck of matches) {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = `/mtg/deck?id=${encodeURIComponent(deck.id)}`;
          link.textContent =
            deck.name +
            (deck.id === selected?.id ? " · Main challenge deck" : "");
          item.append(link);
          list.append(item);
        }

        details.append(list);

        const label = document.createElement("label");
        label.textContent = `Main deck for ${slot.label}`;

        const select = document.createElement("select");
        select.add(new Option("No main deck selected", ""));

        for (const deck of matches) {
          select.add(new Option(deck.name, deck.id));
        }

        select.value = selected?.id ?? "";
        select.disabled = busy;
        label.append(select);

        const save = document.createElement("button");
        save.type = "button";
        save.textContent = "Save main deck";
        save.disabled = busy;
        save.addEventListener("click", () => {
          void saveSelection(slot.key, select.value);
        });

        details.append(label, save);
      } else {
        const empty = document.createElement("p");
        empty.textContent =
          "No decks with this exact commander color identity yet.";
        details.append(empty);
      }

      if (savedId && !selected) {
        const stale = document.createElement("p");
        stale.textContent =
          "Your previous main selection no longer matches the loaded decks " +
          "for this identity. Choose another matching deck.";
        details.append(stale);
      }

      grid.append(details);
    }

    progress.textContent =
      `${completed} / 32 main challenge decks selected.` +
      (unknown
        ? ` ${unknown} decks could not be classified. Choose commanders or refresh their card data; some previews may be unavailable.`
        : "");
  }

  async function saveSelection(identity: string, deckId: string) {
    if (busy || !current()) return;

    if (
      deckId &&
      !(byIdentity.get(identity) ?? []).some((deck) => deck.id === deckId)
    ) {
      return;
    }

    busy = true;
    container
      .querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select")
      .forEach((control) => {
        control.disabled = true;
      });
    status.textContent = "Saving your challenge selection…";

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!current()) return;
      if (sessionError) throw sessionError;
      if (session?.user.id !== userId) {
        throw new Error("Your sign-in changed. Reload before saving.");
      }

      if (!deckId) {
        const { error } = await supabase
          .from("commander_challenge_decks")
          .delete()
          .eq("user_id", userId)
          .eq("color_identity", identity);

        if (error) throw error;
      } else if (selections.has(identity)) {
        const { data, error } = await supabase
          .from("commander_challenge_decks")
          .update({ deck_id: deckId })
          .eq("user_id", userId)
          .eq("color_identity", identity)
          .select("deck_id")
          .single();

        if (error) throw error;
        if (data?.deck_id !== deckId) {
          throw new Error("Couldn’t confirm the selection. Reload the page.");
        }
      } else {
        const { data, error } = await supabase
          .from("commander_challenge_decks")
          .insert({
            user_id: userId,
            color_identity: identity,
            deck_id: deckId,
          })
          .select("deck_id")
          .single();

        if (error) throw error;
        if (data?.deck_id !== deckId) {
          throw new Error("Couldn’t confirm the selection. Reload the page.");
        }
      }

      if (!current()) return;

      if (deckId) selections.set(identity, deckId);
      else selections.delete(identity);

      status.textContent = deckId
        ? "Main challenge deck saved."
        : "Main challenge selection cleared.";
    } catch (error) {
      if (current()) {
        status.textContent =
          error instanceof Error
            ? error.message
            : "Couldn’t save the selection. Reload and try again.";
      }
    } finally {
      if (current()) {
        busy = false;
        render();
      }
    }
  }

  try {
    const { data, error } = await supabase
      .from("commander_challenge_decks")
      .select("color_identity, deck_id")
      .eq("user_id", userId);

    if (!current()) return;
    if (error) throw error;

    for (const row of (data ?? []) as Selection[]) {
      selections.set(row.color_identity, row.deck_id);
    }

    render();
    status.textContent = "";
  } catch {
    if (current()) {
      status.textContent =
        "Couldn’t load challenge selections. Reload the page to try again.";
    }
  }
}
