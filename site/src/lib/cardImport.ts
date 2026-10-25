export type ImportFinish = "nonfoil" | "foil" | "etched";
export type ImportRole = "main" | "commander" | "sideboard" | "maybeboard";

export interface ImportRow {
  line: number;
  name: string;
  quantity: number;
  set: string | null;
  collector: string | null;
  finish: ImportFinish | null;
  role: ImportRole;
  isProxy: boolean | null;
}

interface ImportResult {
  rows: ImportRow[];
  issues: string[];
}

type InputRow = Omit<ImportRow, "line" | "quantity"> & {
  quantity: string | number;
};

export function parseCardList(
  text: string,
  format: "text" | "csv" = "text",
): ImportResult {
  const rows: ImportRow[] = [];
  const issues: string[] = [];

  function add(value: InputRow, line: number) {
    const quantity = Number(value.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      issues.push(`Line ${line}: quantity must be 1–1000.`);
      return;
    }

    if (!value.name || value.name.length > 250) {
      issues.push(`Line ${line}: enter a card name of 1–250 characters.`);
      return;
    }

    rows.push({ ...value, quantity, line });
  }

  text = text.replace(/^\uFEFF/, "");

  if (text.length > 1_000_000) {
    return {
      rows,
      issues: ["The list is too large. Maximum: 1 million characters."],
    };
  }

  if (format === "csv") {
    let records: string[][];

    try {
      records = readCsv(text);
    } catch (error) {
      return {
        rows,
        issues: [
          error instanceof Error ? error.message : "Couldn’t read this CSV.",
        ],
      };
    }

    const headers = (records.shift() ?? []).map((value) =>
      value.trim().toLowerCase(),
    );

    for (const required of ["name", "count"]) {
      if (!headers.includes(required)) {
        issues.push(`CSV is missing the ${required} column.`);
      }
    }

    if (new Set(headers).size !== headers.length) {
      issues.push("CSV contains duplicate column names.");
    }

    if (issues.length) return { rows, issues };

    const finishValues: Record<string, ImportFinish> = {
      "": "nonfoil",
      false: "nonfoil",
      nonfoil: "nonfoil",
      true: "foil",
      foil: "foil",
      etched: "etched",
    };

    records.forEach((cells, index) => {
      const line = index + 2;
      if (cells.every((value) => !value.trim())) return;

      if (cells.length !== headers.length) {
        issues.push(`Row ${line}: column count does not match the header.`);
        return;
      }

      const field = (name: string) =>
        (cells[headers.indexOf(name)] ?? "").trim();

      const finish = finishValues[field("foil").toLowerCase()];
      const proxy = field("proxy").toLowerCase();

      const roleValue = field("role").toLowerCase();
      let role: ImportRole = "main";

      if (
        roleValue === "main" ||
        roleValue === "commander" ||
        roleValue === "sideboard" ||
        roleValue === "maybeboard"
      ) {
        role = roleValue;
      } else if (roleValue !== "") {
        issues.push(
          `Row ${line}: role must be main, commander, sideboard, or maybeboard.`,
        );
        return;
      }

      if (!finish || !["", "true", "false"].includes(proxy)) {
        issues.push(`Row ${line}: unrecognized finish or proxy status.`);
        return;
      }

      add(
        {
          name: field("name"),
          quantity: field("count"),
          set: field("edition") || null,
          collector: field("collector number") || null,
          finish,
          role,
          isProxy: proxy ? proxy === "true" : null,
        },
        line,
      );
    });
  } else {
    let role: ImportRole = "main";

    const sections: Record<string, ImportRole> = {
      commander: "commander",
      commanders: "commander",
      main: "main",
      maindeck: "main",
      sideboard: "sideboard",
      maybeboard: "maybeboard",
    };

    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.trim();

      // ManaBox separates its commander block from the main deck
      // with a blank line.
      if (!line) {
        if (role === "commander") role = "main";
        continue;
      }

      if (line.startsWith("//")) {
        const section = line.slice(2).trim().toLowerCase().replace(/\s+/g, "");

        const mapped = sections[section];

        if (mapped) role = mapped;
        else issues.push(`Line ${index + 1}: unknown section “${line}”.`);

        continue;
      }

      let name = line;
      let quantity = "1";

      const quantityMatch = /^(\d+)\s*(?:x\s+|\s+)(.+)$/i.exec(name);

      if (quantityMatch) {
        quantity = quantityMatch[1];
        name = quantityMatch[2];
      }

      let finish: ImportFinish | null = null;
      const marker = /\s+\*([A-Za-z]+)\*$/.exec(name);

      if (marker) {
        const code = marker[1].toUpperCase();

        if (code !== "F" && code !== "E") {
          issues.push(`Line ${index + 1}: unsupported finish marker.`);
          continue;
        }

        finish = code === "F" ? "foil" : "etched";
        name = name.slice(0, marker.index).trim();
      }

      let set: string | null = null;
      let collector: string | null = null;

      const printing = /\s+\(([A-Za-z0-9]+)\)(?:\s+([^\s]+))?$/.exec(name);

      if (printing) {
        set = printing[1];
        collector = printing[2] ?? null;
        name = name.slice(0, printing.index).trim();
        finish ??= "nonfoil";
      }

      add(
        {
          name,
          quantity,
          set,
          collector,
          finish,
          role,
          isProxy: null,
        },
        index + 1,
      );
    }
  }

  if (rows.length > 1000) {
    return {
      rows: [],
      issues: ["Maximum: 1,000 card entries per import."],
    };
  }

  if (!rows.length && !issues.length) {
    issues.push("Paste a card list or choose a file first.");
  }

  return { rows, issues };
}

function readCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;

  function endField() {
    record.push(field);
    field = "";
    closed = false;
  }

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else {
        field += character;
      }
    } else if (character === ",") {
      endField();
    } else if (character === "\n" || character === "\r") {
      endField();
      records.push(record);
      record = [];

      if (character === "\r" && text[i + 1] === "\n") i++;
    } else if (character === '"' && !field && !closed) {
      quoted = true;
    } else if (closed) {
      if (!/\s/.test(character)) {
        throw new Error("Invalid CSV: unexpected text after a closing quote.");
      }
    } else if (character === '"') {
      throw new Error("Invalid CSV: quote inside an unquoted field.");
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("Invalid CSV: an opening quote has no closing quote.");
  }

  if (field || record.length || closed) {
    endField();
    records.push(record);
  }

  return records;
}
