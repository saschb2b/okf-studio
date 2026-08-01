package app.okfviewer.desktop

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    insetContentBelowTheSystemBars()
  }

  /**
   * Keep the app's chrome clear of the status bar, the navigation bar, and the
   * on-screen keyboard.
   *
   * Android 15 and later draw every app edge to edge with no opt-out, and a
   * WebView is not told that this happened: `env(safe-area-inset-*)` reports 0
   * inside the page even with `viewport-fit=cover`, so the top bar renders
   * under the status bar clock and the status bar under the gesture pill. The
   * numbers only exist out here, so the padding is applied out here.
   *
   * The IME inset is in the set on purpose: with it, the webview shrinks above
   * the keyboard instead of leaving a focused field behind it.
   */
  private fun insetContentBelowTheSystemBars() {
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, windowInsets ->
      val insets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime(),
      )
      view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(StorageAccess(this), "OkfStorageAccess")
  }
}

/**
 * The all-files storage permission, reachable from the webview.
 *
 * A bundle is a folder of Markdown that Studio scans, reads, and stages writes
 * against, and Android's own picker returns a `content://` URI that none of
 * that code can open. All-files access makes shared storage an ordinary path
 * tree, which is what the OKF core, the file watcher, and the staged-write
 * pipeline already speak.
 *
 * This lives in Kotlin rather than in Rust because both calls need the
 * activity. Tauri does not hand the Rust side one, and `ndk_context`, the usual
 * way to reach it, is not initialized under Tauri's activity: calling it aborts
 * the process with "android context was not initialized".
 */
class StorageAccess(private val activity: MainActivity) {
  /**
   * Whether the app may read the *contents* of files in shared storage.
   *
   * Listing a directory is a different question with a different answer, which
   * is why this asks the framework rather than probing with a read. Without the
   * permission, Android still lets an app walk the folder tree and then denies
   * every file inside it, so a probe reports access that does not exist.
   *
   * Below API 30 there is no all-files concept, and the manifest's
   * `READ_EXTERNAL_STORAGE` is the whole grant.
   */
  @JavascriptInterface
  fun isGranted(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      true
    }

  /**
   * Open the system screen where the user turns all-files access on. Android
   * exposes no way to grant it from inside an app, so taking the user to the
   * right screen is the most that can be done. The `package:` URI opens
   * Studio's own row rather than a list of every installed app.
   */
  @JavascriptInterface
  fun requestAccess() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val intent = Intent(
      Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
      Uri.parse("package:${activity.packageName}"),
    )
    activity.startActivity(intent)
  }
}
