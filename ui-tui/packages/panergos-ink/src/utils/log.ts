export function logError(error: unknown): void {
  if (!process.env.PANERGOS_INK_DEBUG_ERRORS) {
    return
  }

  console.error(error)
}
