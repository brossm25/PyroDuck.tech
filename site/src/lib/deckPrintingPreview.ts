interface PreviewCard {
  name: string;
  finishes: string[];
}

interface PreviewOptions<T extends PreviewCard> {
  printing: HTMLSelectElement;
  finish: HTMLSelectElement;
  image: HTMLImageElement;
  art: HTMLElement;
  save: HTMLButtonElement;
  selectedCard: () => T | undefined;
  imageFor: (card: T) => string | null | undefined;
  canSave: () => boolean;
}

export function createDeckPrintingPreview<T extends PreviewCard>({
  printing,
  finish,
  image,
  art,
  save,
  selectedCard,
  imageFor,
  canSave,
}: PreviewOptions<T>) {
  function updateFinishEffect() {
    art.dataset.finish = finish.value;
  }

  function render() {
    const card = selectedCard();

    finish.replaceChildren();
    image.hidden = true;
    art.hidden = true;
    save.disabled = true;

    if (!card) return;

    for (const value of card.finishes) {
      const label =
        value === "nonfoil"
          ? "Nonfoil"
          : value === "etched"
            ? "Etched foil"
            : "Foil";

      finish.add(new Option(label, value));
    }

    const url = imageFor(card);

    if (url) {
      image.src = url;
      image.alt = card.name;
      image.hidden = false;
      art.hidden = false;
    }

    updateFinishEffect();
    save.disabled = !canSave() || card.finishes.length === 0;
  }

  finish.addEventListener("change", updateFinishEffect);
  printing.addEventListener("change", render);

  return render;
}
