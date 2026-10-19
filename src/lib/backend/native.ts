import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Backend,
  BackendEvent,
  CurrentActivity,
  Settings,
  TimerCompleted,
  TimerSnapshot,
  TrackerStatus,
} from "../types";

const isDesktop = () => !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Talks to the Rust core over Tauri IPC. */
export function createNativeBackend(): Backend {
  return {
    kind: "native",
    getSettings: () => invoke("get_settings"),
    updateSettings: (settings) => invoke("update_settings", { settings }),

    timerGet: () => invoke("timer_get"),
    timerAction: (action) => invoke("timer_action", { action }),
    timerSetPhase: (phase) => invoke("timer_set_phase", { phase }),
    timerExtend: (minutes) => invoke("timer_extend", { minutes }),
    timerSetIntention: (intention, taskId) =>
      invoke("timer_set_intention", { intention, taskId }),

    activitySpans: (from, to) => invoke("activity_spans", { from, to }),
    bucketTotals: (buckets) => invoke("bucket_totals", { buckets }),
    entityTotals: (from, to) => invoke("entity_totals", { from, to }),
    focusSessions: (from, to) => invoke("focus_sessions", { from, to }),

    tasksList: () => invoke("tasks_list"),
    taskCreate: (title, estimate) => invoke("task_create", { title, estimate }),
    taskUpdate: (id, patch) => invoke("task_update", { id, ...patch }),
    taskDelete: (id) => invoke("task_delete", { id }),

    rulesList: () => invoke("rules_list"),
    ruleSet: (rule) => invoke("rule_set", { rule }),
    ruleDelete: (key) => invoke("rule_delete", { key }),

    trackerStatus: () => invoke("tracker_status"),
    trackerPause: (minutes) => invoke("tracker_pause", { minutes }),
    usagePermissionRequest: () => invoke("usage_permission_request"),
    usageSync: () => invoke("usage_sync"),

    dataInfo: () => invoke("data_info"),
    async exportData(format) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await save({
        title: "Export your Kairo data",
        defaultPath: `kairo-export-${stamp}.${format}`,
        filters: [
          format === "csv"
            ? { name: "CSV", extensions: ["csv"] }
            : { name: "JSON", extensions: ["json"] },
        ],
      });
      if (!path) return false;
      await invoke("export_data", { path, format });
      return true;
    },
    wipeData: () => invoke("wipe_data"),

    async autostartEnabled() {
      if (!isDesktop()) return null;
      const { isEnabled } = await import("@tauri-apps/plugin-autostart");
      return isEnabled();
    },
    async setAutostart(enabled) {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      await (enabled ? enable() : disable());
    },
    async ensureNotificationPermission() {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === "granted";
    },

    subscribe(listener: (event: BackendEvent) => void) {
      const offs = [
        listen<TimerSnapshot>("timer://state", (e) =>
          listener({ type: "timer", snapshot: e.payload }),
        ),
        listen<TimerCompleted>("timer://completed", (e) =>
          listener({ type: "completed", completed: e.payload }),
        ),
        listen<CurrentActivity | null>("tracker://current", (e) =>
          listener({ type: "current", current: e.payload }),
        ),
        listen<TrackerStatus>("tracker://status", (e) =>
          listener({ type: "tracker", status: e.payload }),
        ),
        listen<Settings>("settings://changed", (e) =>
          listener({ type: "settings", settings: e.payload }),
        ),
        listen("data://changed", () => listener({ type: "data" })),
      ];
      return () => offs.forEach((p) => p.then((off) => off()));
    },
  };
}
