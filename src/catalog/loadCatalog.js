/** The ~1,000-track catalog ships with the app as its own cached chunk. */
export async function loadCatalog() {
  const module = await import("./tracks.json");
  return module.default;
}
