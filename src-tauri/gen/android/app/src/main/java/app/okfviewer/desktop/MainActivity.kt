package app.okfviewer.desktop

import android.os.Bundle
import android.view.View
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
}
