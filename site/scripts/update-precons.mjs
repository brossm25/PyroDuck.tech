import { mkdir, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("../public/data/precons/", import.meta.url);
await mkdir(output, { recursive: true });

async function fetchData(path) {
  const response = await fetch(`https://mtgjson.com/api/v5/${path}`, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }

  const body = await response.json();

  if (!body.data) throw new Error(`${path}: missing data`);
  return body.data;
}

async function saveJson(name, data) {
  const destination = new URL(name, output);
  const temporary = new URL(`${name}.tmp`, output);

  await writeFile(temporary, JSON.stringify(data));
  await rename(temporary, destination);
}

function compactCard(card) {
  return {
    uuid: card.uuid,
    name: card.name,
    faceName: card.faceName ?? null,
    count: card.count,
    scryfallId: card.identifiers?.scryfallId ?? null,
    type: card.type ?? "",
    text: card.text ?? "",
    side: card.side ?? null,
    layout: card.layout ?? "normal",
    otherFaceIds: card.otherFaceIds ?? [],
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    colorIdentity: card.colorIdentity ?? [],
  };
}

const [deckList, setList] = await Promise.all([
  fetchData("DeckList.json"),
  fetchData("SetList.json"),
]);

const setNames = new Map(
  setList.map((set) => [set.code.toUpperCase(), set.name]),
);

const today = new Date().toISOString().slice(0, 10);

const precons = deckList
  .filter(
    (deck) =>
      deck.type === "Commander Deck" &&
      typeof deck.releaseDate === "string" &&
      deck.releaseDate <= today,
  )
  .sort(
    (a, b) =>
      b.releaseDate.localeCompare(a.releaseDate) ||
      a.name.localeCompare(b.name),
  );

if (!precons.length) throw new Error("No released Commander precons found.");

const catalog = [];
const failures = [];

const isCollector = (deck) => /collector['’]?s?\s+edition/i.test(deck.name);

function editionKey(deck) {
  return `${deck.code}:${deck.name
    .replace(/\s*collector['’]?s?\s+edition/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`;
}

const collectorKeys = new Set(precons.filter(isCollector).map(editionKey));

const preferredPrecons = precons.filter(
  (deck) => isCollector(deck) || !collectorKeys.has(editionKey(deck)),
);

for (const [index, metadata] of preferredPrecons.entries()) {
  try {
    if (!/^[a-zA-Z0-9_-]+$/.test(metadata.fileName)) {
      throw new Error("Unexpected deck filename.");
    }

    const deck = await fetchData(`decks/${metadata.fileName}.json`);

    if (!deck.commander?.length || !deck.mainBoard?.length) {
      throw new Error("Missing commander or main deck.");
    }

    const commanders = deck.commander.map(compactCard);
    const mainBoard = deck.mainBoard.map(compactCard);

    await saveJson(`${metadata.fileName}.json`, {
      id: metadata.fileName,
      name: deck.name,
      commanders,
      mainBoard,
    });

    catalog.push({
      id: metadata.fileName,
      name: deck.name,
      setCode: metadata.code,
      setName: setNames.get(metadata.code.toUpperCase()) ?? metadata.code,
      releaseDate: metadata.releaseDate,
      commanders: commanders.map((card) => ({
        name: card.faceName || card.name,
        scryfallId: card.scryfallId,
        colors: card.colorIdentity,
      })),
    });

    console.log(`[${index + 1}/${preferredPrecons.length}] ${deck.name}`);
  } catch (error) {
    failures.push(`${metadata.name}: ${error.message}`);
    console.error(`FAILED: ${failures.at(-1)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
}

if (failures.length) {
  throw new Error(
    `${failures.length} decks failed. Catalog was not replaced.\n` +
      failures.join("\n"),
  );
}

await saveJson("index.json", {
  updatedAt: new Date().toISOString(),
  source: "MTGJSON",
  decks: catalog,
});

console.log(`Saved ${catalog.length} precons to ${fileURLToPath(output)}`);
