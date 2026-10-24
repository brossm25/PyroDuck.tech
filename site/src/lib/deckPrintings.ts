interface PrintingPage<T> {
  data: T[];
  has_more: boolean;
  next_page?: string;
}

export async function loadDeckPrintings<T>(
  printsSearchUri: string,
  signal: AbortSignal,
): Promise<T[]> {
  const endpoint = new URL(printsSearchUri);
  endpoint.searchParams.set(
    "q",
    `(${endpoint.searchParams.get("q") ?? ""}) game:paper`,
  );
  endpoint.searchParams.set("unique", "prints");

  let next: string | undefined = endpoint.href;
  const printings: T[] = [];

  while (next) {
    signal.throwIfAborted();

    const response = await fetch(next, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("Couldn’t load printings. Close and try again.");
    }

    const page: PrintingPage<T> = await response.json();
    printings.push(...page.data);
    next = page.has_more ? page.next_page : undefined;

    if (next) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }

    signal.throwIfAborted();
  }

  return printings;
}
