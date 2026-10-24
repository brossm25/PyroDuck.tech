export function renderManaCost(parent: HTMLElement, cost: string | null) {
  parent.replaceChildren();

  if (!cost) {
    parent.textContent = "—";
    parent.setAttribute("aria-label", "No mana cost listed");
    return;
  }

  const parts = cost.split(/(\{[^}]+\})/g).filter(Boolean);

  for (const part of parts) {
    if (!/^\{[^}]+\}$/.test(part)) {
      parent.append(document.createTextNode(part));
      continue;
    }

    const symbol = part.slice(1, -1);
    const filename = symbol
      .replaceAll("/", "")
      .replace("∞", "INFINITY")
      .replace("½", "HALF");

    if (!/^[A-Z0-9]+$/.test(filename)) {
      parent.append(document.createTextNode(part));
      continue;
    }

    const icon = document.createElement("img");
    icon.className = "mana-symbol";
    icon.src = `https://svgs.scryfall.io/card-symbols/${filename}.svg`;
    icon.alt = part;
    icon.title = part;
    icon.width = 20;
    icon.height = 20;

    icon.addEventListener(
      "error",
      () => icon.replaceWith(document.createTextNode(part)),
      { once: true },
    );

    parent.append(icon);
  }
}
