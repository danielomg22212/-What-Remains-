export function createClickSuppressor() {
  let suppressUntil = 0;

  return {
    suppressFor(milliseconds) {
      suppressUntil = Date.now() + milliseconds;
    },
    isSuppressed(now = Date.now()) {
      return now < suppressUntil;
    }
  };
}

