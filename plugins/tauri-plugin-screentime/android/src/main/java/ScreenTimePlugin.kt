package app.kairo.screentime

import android.app.Activity
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class QueryArgs {
    var from: Long = 0
    var to: Long = 0
}

private class Span(val pkg: String, val start: Long, var end: Long)

// UsageEvents.Event type ids, inlined so minSdk 24 builds without API-level lint noise.
private const val ACTIVITY_RESUMED = 1 // MOVE_TO_FOREGROUND before API 29
private const val ACTIVITY_PAUSED = 2 // MOVE_TO_BACKGROUND before API 29
private const val SCREEN_NON_INTERACTIVE = 16
private const val KEYGUARD_SHOWN = 17

// Activity hops inside one app arrive as pause/resume pairs; join them back up.
private const val MERGE_GAP_MS = 2_000L

@TauriPlugin
class ScreenTimePlugin(private val activity: Activity) : Plugin(activity) {

    private fun hasUsageAccess(): Boolean {
        val appOps = activity.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun homePackages(): Set<String> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val launchers = activity.packageManager
            .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            .map { it.activityInfo.packageName }
        return launchers.toSet() + "com.android.systemui"
    }

    @Command
    fun checkPermission(invoke: Invoke) {
        val ret = JSObject()
        ret.put("granted", hasUsageAccess())
        invoke.resolve(ret)
    }

    @Command
    fun requestPermission(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
        invoke.resolve()
    }

    @Command
    fun queryEvents(invoke: Invoke) {
        val args = invoke.parseArgs(QueryArgs::class.java)
        if (!hasUsageAccess()) {
            invoke.reject("Usage access has not been granted")
            return
        }

        val usm = activity.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val events = usm.queryEvents(args.from, args.to)
        val ignored = homePackages()
        val spans = ArrayList<Span>()
        var openPkg: String? = null
        var openStart = 0L

        fun close(at: Long) {
            val pkg = openPkg ?: return
            openPkg = null
            if (at <= openStart || pkg in ignored) return
            val last = spans.lastOrNull()
            if (last != null && last.pkg == pkg && openStart - last.end <= MERGE_GAP_MS) {
                last.end = at
            } else {
                spans.add(Span(pkg, openStart, at))
            }
        }

        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            when (event.eventType) {
                ACTIVITY_RESUMED -> if (openPkg != event.packageName) {
                    close(event.timeStamp)
                    openPkg = event.packageName
                    openStart = event.timeStamp
                }
                ACTIVITY_PAUSED -> if (openPkg == event.packageName) close(event.timeStamp)
                SCREEN_NON_INTERACTIVE, KEYGUARD_SHOWN -> close(event.timeStamp)
            }
        }
        close(minOf(System.currentTimeMillis(), args.to))

        val pm = activity.packageManager
        val labels = HashMap<String, String>()
        val out = JSArray()
        for (span in spans) {
            val label = labels.getOrPut(span.pkg) {
                try {
                    pm.getApplicationLabel(pm.getApplicationInfo(span.pkg, 0)).toString()
                } catch (e: PackageManager.NameNotFoundException) {
                    span.pkg
                }
            }
            val o = JSObject()
            o.put("package", span.pkg)
            o.put("label", label)
            o.put("start", span.start)
            o.put("end", span.end)
            out.put(o)
        }
        val ret = JSObject()
        ret.put("spans", out)
        invoke.resolve(ret)
    }
}
