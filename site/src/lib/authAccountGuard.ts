interface AccountSession {
  user: { id: string };
}

export function createAccountChangeGuard() {
  let observedUserId: string | null | undefined;

  return (event: string, session: AccountSession | null): boolean => {
    if (
      event !== "INITIAL_SESSION" &&
      event !== "SIGNED_IN" &&
      event !== "SIGNED_OUT"
    ) {
      return false;
    }

    const nextUserId = session?.user.id ?? null;

    // The page's initial load handles the first session.
    if (observedUserId === undefined) {
      observedUserId = nextUserId;
      return false;
    }

    if (nextUserId === observedUserId) return false;

    observedUserId = nextUserId;
    return true;
  };
}
