import { EMPTY, normalizeConfiguration, type Configuration } from "./settings";
import { STORAGE_KEY } from "./storage-key";
export { STORAGE_KEY } from "./storage-key";
export async function readConfiguration(): Promise<Configuration> {
  const storage = globalThis.chrome?.storage;
  try {
    const value = storage
      ? (await storage.local.get(STORAGE_KEY))[STORAGE_KEY]
      : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const safe = value ? normalizeConfiguration(value) : structuredClone(EMPTY);
    if (value?.version === 1) await writeConfiguration(safe);
    return safe;
  } catch {
    return structuredClone(EMPTY);
  }
}
export async function writeConfiguration(config: Configuration): Promise<void> {
  const safe = normalizeConfiguration(config);
  if (globalThis.chrome?.storage)
    await chrome.storage.local.set({ [STORAGE_KEY]: safe });
  else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event("webscaly:configuration"));
  }
}
