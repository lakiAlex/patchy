import { invoke } from "@tauri-apps/api/core";

/**
 * Sends one anonymous "app_started" event to Aptabase, which counts how many people use the app.
 * Does nothing when the setting is off, and fails quietly in builds without an Aptabase key.
 */
export function trackAppStarted(enabled: boolean) {
  if (!enabled) return;
  invoke("plugin:aptabase|track_event", { name: "app_started" }).catch(() => {});
}
