import { supabase } from "@/lib/supabase";
import { roleNames } from "@/lib/deckSections";

interface EditableEntry {
  id: string;
  name: string;
  quantity: number;
  card_role: string;
  is_proxy: boolean;
  price_usd: number | string | null;
  manual_price_usd: number | string | null;
}

interface EditorOptions {
  deckId: string;
  isBusy: () => boolean;
  mutate: (action: () => Promise<void>) => Promise<void>;
  loadEntries: () => Promise<void>;
  message: (text: string) => void;
}

export function createDeckEntryEditor(
  entry: EditableEntry,
  { deckId, isBusy, mutate, loadEntries, message }: EditorOptions,
): HTMLDetailsElement {
  const actions = document.createElement("div");
  actions.className = "entry-actions";
  const count = document.createElement("input");
  count.type = "number";
  count.min = "1";
  count.max = "1000";
  count.step = "1";
  count.value = String(entry.quantity);
  count.setAttribute("aria-label", `Quantity of ${entry.name}`);
  const update = document.createElement("button");
  update.textContent = "Save quantity";
  update.addEventListener("click", () => {
    const value = Number(count.value);
    if (!count.reportValidity() || !Number.isInteger(value)) return;
    void mutate(async () => {
      const { data, error } = await supabase
        .from("deck_cards")
        .update({ quantity: value })
        .eq("id", entry.id)
        .eq("deck_id", deckId!)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error("Quantity was not saved. Refresh and try again.");
      await loadEntries();
      message("Quantity saved.");
    });
  });
  const remove = document.createElement("button");
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    if (isBusy() || !confirm(`Remove ${entry.name} from this deck?`)) return;
    void mutate(async () => {
      const { data, error } = await supabase
        .from("deck_cards")
        .delete()
        .eq("id", entry.id)
        .eq("deck_id", deckId!)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error("Card was not removed. Refresh and try again.");
      await loadEntries();
      message("Card removed.");
    });
  });
  const proxyButton = document.createElement("button");
  proxyButton.type = "button";
  proxyButton.textContent = entry.is_proxy ? "Mark as owned" : "Mark as proxy";

  proxyButton.addEventListener("click", () => {
    void mutate(async () => {
      const { data, error } = await supabase
        .from("deck_cards")
        .update({ is_proxy: !entry.is_proxy })
        .eq("id", entry.id)
        .eq("deck_id", deckId!)
        .select("id");

      if (error) throw error;
      if (!data?.length) {
        throw new Error("Proxy status was not saved. Refresh and try again.");
      }

      await loadEntries();
      message(
        entry.is_proxy ? "Card marked as owned." : "Card marked as proxy.",
      );
    });
  });

  const destination = document.createElement("select");
  destination.setAttribute("aria-label", `Section for ${entry.name}`);

  for (const [value, label] of Object.entries(roleNames)) {
    destination.add(new Option(label, value));
  }
  destination.value = entry.card_role;

  const move = document.createElement("button");
  move.type = "button";
  move.textContent = "Move card";

  move.addEventListener("click", () => {
    const selectedRole = destination.value;
    if (selectedRole === entry.card_role) return;

    void mutate(async () => {
      const { data, error } = await supabase
        .from("deck_cards")
        .update({ card_role: selectedRole })
        .eq("id", entry.id)
        .eq("deck_id", deckId!)
        .select("id");

      if (error?.code === "23505") {
        throw new Error(
          "That printing and finish already exists in the destination. Adjust its quantity there first.",
        );
      }
      if (error) throw error;
      if (!data?.length) throw new Error("Card was not moved.");

      await loadEntries();
      message(`Moved ${entry.name} to ${roleNames[selectedRole]}.`);
    });
  });

  if (entry.price_usd === null || entry.manual_price_usd !== null) {
    const estimateLabel = document.createElement("label");
    estimateLabel.textContent = "Your estimate per copy (USD)";

    const estimate = document.createElement("input");
    estimate.type = "number";
    estimate.min = "0";
    estimate.max = "99999999.99";
    estimate.step = "0.01";
    estimate.inputMode = "decimal";
    estimate.placeholder = "Enter estimated value";
    estimate.value =
      entry.manual_price_usd === null ? "" : String(entry.manual_price_usd);

    estimateLabel.append(estimate);

    const explanation = document.createElement("p");
    explanation.textContent =
      "Your estimate stays unchanged until you edit it. When a price refresh finds a Scryfall price, that price takes priority.";

    const saveEstimate = document.createElement("button");
    saveEstimate.type = "button";
    saveEstimate.textContent = "Save estimate";

    saveEstimate.addEventListener("click", () => {
      const raw = estimate.value.trim();

      if (!raw) {
        estimate.focus();
        message("Enter an estimated value first.");
        return;
      }

      if (!estimate.reportValidity()) return;

      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99) {
        message("Enter a valid estimate.");
        return;
      }

      void mutate(async () => {
        const { data, error } = await supabase
          .from("deck_cards")
          .update({
            manual_price_usd: amount,
            manual_price_updated_at: new Date().toISOString(),
          })
          .eq("id", entry.id)
          .eq("deck_id", deckId!)
          .select("id");

        if (error) throw error;
        if (!data?.length) throw new Error("Estimate was not saved.");

        await loadEntries();
        message(`Estimate saved for ${entry.name}.`);
      });
    });

    actions.append(estimateLabel, explanation, saveEstimate);

    if (entry.manual_price_usd !== null) {
      const clearEstimate = document.createElement("button");
      clearEstimate.type = "button";
      clearEstimate.textContent = "Clear estimate";

      clearEstimate.addEventListener("click", () => {
        void mutate(async () => {
          const { data, error } = await supabase
            .from("deck_cards")
            .update({
              manual_price_usd: null,
              manual_price_updated_at: null,
            })
            .eq("id", entry.id)
            .eq("deck_id", deckId!)
            .select("id");

          if (error) throw error;
          if (!data?.length) throw new Error("Estimate was not cleared.");

          await loadEntries();
          message(`Estimate cleared for ${entry.name}.`);
        });
      });

      actions.append(clearEstimate);
    }
  }

  actions.append(count, update, proxyButton, destination, move, remove);

  const editor = document.createElement("details");
  editor.className = "entry-editor";

  const summary = document.createElement("summary");
  summary.textContent = "Edit card";
  summary.setAttribute("aria-label", `Edit ${entry.name}`);

  editor.append(summary, actions);
  return editor;
}
