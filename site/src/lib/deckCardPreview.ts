import { safeCardImage } from "@/lib/mtgFormat";

interface PreviewEntry {
  name: string;
  finish: string;
  image_url: string | null;
  card_faces:
    | {
        name: string;
        image_url: string | null;
      }[]
    | null;
}

interface PreviewOptions {
  dialog: HTMLDialogElement;
  image: HTMLImageElement;
  art: HTMLElement;
  faces: HTMLElement;
  flip: HTMLButtonElement;
  heading: HTMLElement;
}

export function createDeckCardPreview({
  dialog,
  image,
  art,
  faces: faceControls,
  flip,
  heading,
}: PreviewOptions) {
  let flipPreview: (() => void) | null = null;
  let previewTrigger: HTMLButtonElement | null = null;

  flip.addEventListener("click", () => flipPreview?.());

  function open(entry: PreviewEntry, trigger: HTMLButtonElement) {
    const faces: { name: string; image_url: string }[] = [];

    for (const face of entry.card_faces ?? []) {
      const url = safeCardImage(face.image_url);
      if (url) faces.push({ name: face.name, image_url: url });
    }

    if (!faces.length) {
      const url = safeCardImage(entry.image_url);
      if (url) faces.push({ name: entry.name, image_url: url });
    }

    if (!faces.length) return;

    previewTrigger = trigger;
    art.dataset.finish = entry.finish;
    faceControls.replaceChildren();
    flip.hidden = faces.length !== 2;
    flipPreview = null;
    let currentFace = 0;

    function showFace(index: number) {
      currentFace = index;
      const face = faces[index];
      const flipLabel = index === 0 ? "Show back face" : "Show front face";
      flip.setAttribute("aria-label", flipLabel);
      flip.title = flipLabel;
      image.src = face.image_url;
      image.alt = face.name;
      heading.textContent = face.name;

      Array.from(faceControls.children).forEach((button, position) => {
        button.setAttribute("aria-pressed", String(position === index));
      });
    }

    if (faces.length === 2) {
      flipPreview = () => showFace(currentFace === 0 ? 1 : 0);
    } else if (faces.length > 2) {
      faces.forEach((face, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent =
          index === 0 ? "Front" : index === 1 ? "Back" : `Face ${index + 1}`;
        button.title = face.name;
        button.addEventListener("click", () => showFace(index));
        faceControls.append(button);
      });
    }

    showFace(0);
    dialog.showModal();
  }

  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;

    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      dialog.close();
    }
  });

  dialog.addEventListener("close", () => {
    flipPreview = null;
    flip.hidden = true;
    image.removeAttribute("src");
    if (previewTrigger?.isConnected) previewTrigger.focus();
    previewTrigger = null;
  });

  return open;
}
