interface AccountSession {
  user: { id: string };
}

export function createAccountChangeGuard(notifyInitial = false) {
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

    // Some components use the first auth event for their initial load.
    if (observedUserId === undefined) {
      observedUserId = nextUserId;
      return notifyInitial;
    }

    if (nextUserId === observedUserId) return false;

    observedUserId = nextUserId;
    return true;
  };
}
