interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

interface PaginationOptions {
  pageSize?: number;
  isCurrent?: () => boolean;
}

export async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 100, isCurrent = () => true }: PaginationOptions = {},
): Promise<T[] | null> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Page size must be a positive integer.");
  }

  const entries: T[] = [];
  let offset = 0;

  while (isCurrent()) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);

    // Ignore stale responses, including their errors.
    if (!isCurrent()) return null;
    if (error) throw error;

    const page = data ?? [];
    if (page.length === 0) return entries;

    entries.push(...page);
    offset += page.length;
  }

  return null;
}
