import { loadDeckPrintings } from "@/lib/deckPrintings";
import { createDeckPrintingPreview } from "@/lib/deckPrintingPreview";

interface PickerCard {
  id: string;
  name: string;
  set_name: string;
  collector_number: string;
  prints_search_uri: string;
  finishes: string[];
}

interface ExistingPrinting {
  printingId: string;
  finish: string;
  quantity: number;
  role: string;
  isProxy: boolean;
}

interface PickerOptions<T extends PickerCard> {
  dialog: HTMLDialogElement;
  printing: HTMLSelectElement;
  finish: HTMLSelectElement;
  role: HTMLSelectElement;
  quantity: HTMLInputElement;
  proxy: HTMLInputElement;
  image: HTMLImageElement;
  art: HTMLElement;
  save: HTMLButtonElement;
  status: HTMLElement;
  canEdit: () => boolean;
  getVersion: () => number;
  imageFor: (card: T) => string | null | undefined;
  errorText: (error: unknown) => string;
}

export function createDeckPicker<T extends PickerCard>({
  dialog,
  printing,
  finish,
  role,
  quantity,
  proxy,
  image,
  art,
  save,
  status,
  canEdit,
  getVersion,
  imageFor,
  errorText,
}: PickerOptions<T>) {
  let printings: T[] = [];
  let editing = false;
  let controller: AbortController | undefined;

  const selectedCard = () => printings[Number(printing.value)];

  const previewPrinting = createDeckPrintingPreview<T>({
    printing,
    finish,
    image,
    art,
    save,
    selectedCard,
    imageFor,
    canSave: canEdit,
  });

  dialog.addEventListener("close", () => controller?.abort());

  function sync() {
    save.disabled =
      !canEdit() || !selectedCard()?.finishes.includes(finish.value);

    quantity.disabled = editing || !canEdit();
    role.disabled = editing || !canEdit();
    proxy.disabled = editing || !canEdit();
  }

  function reset() {
    editing = false;
    printings = [];
    controller?.abort();
    dialog.close();
    sync();
  }

  async function choose(card: T, existing?: ExistingPrinting) {
    if (!canEdit()) return;

    const current = getVersion();
    controller?.abort();
    const request = new AbortController();
    controller = request;

    printings = [];
    printing.replaceChildren();
    finish.replaceChildren();
    image.hidden = true;
    editing = existing !== undefined;
    quantity.value = String(existing?.quantity ?? 1);
    proxy.checked = existing?.isProxy ?? false;
    art.hidden = true;
    role.value = existing?.role ?? "main";

    save.textContent = editing ? "Save printing" : "Add to deck";
    const heading = dialog.querySelector<HTMLElement>("#picker-heading");
    if (heading) {
      heading.textContent = editing
        ? `Change printing · ${card.name}`
        : "Choose printing";
    }

    sync();
    save.disabled = true;
    status.textContent = `Loading versions of ${card.name}…`;
    dialog.showModal();

    try {
      const all = await loadDeckPrintings<T>(
        card.prints_search_uri,
        request.signal,
      );

      if (current !== getVersion() || request.signal.aborted) return;

      printings = all;
      all.forEach((item, index) =>
        printing.add(
          new Option(
            `${item.set_name} — #${item.collector_number}`,
            String(index),
          ),
        ),
      );

      status.textContent = all.length
        ? "Choose printing, finish, and how to use the card."
        : "No paper printings found.";

      if (existing) {
        const index = all.findIndex((item) => item.id === existing.printingId);

        if (index >= 0) printing.value = String(index);
      }

      previewPrinting();

      if (existing && selectedCard()?.finishes.includes(existing.finish)) {
        finish.value = existing.finish;
        finish.dispatchEvent(new Event("change"));
      }

      sync();

      if (existing && all.length) {
        status.textContent =
          "Choose a printing and finish. Quantity, section, and proxy status stay unchanged.";
      }
    } catch (error) {
      if (!request.signal.aborted && current === getVersion()) {
        status.textContent = errorText(error);
      }
    }
  }

  return { choose, reset, sync, selectedCard };
}
