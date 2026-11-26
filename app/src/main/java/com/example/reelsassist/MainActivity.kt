package com.example.reelsassist

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {

    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("cfg", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val bar = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fun btn(label: String, onTap: () -> Unit) = Button(this).apply {
            text = label
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#CC111111"))
            setOnClickListener { onTap() }
            bar.addView(this, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = 8 })
        }
        btn("Like") { run("RLS.like()") }
        btn("Save") { run("RLS.save()") }
        btn("Draft") { run("RLS.draft()") }
        btn("Set") { showSettings() }

        root.addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.CENTER_VERTICAL).apply { rightMargin = 8 })
        setContentView(root)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.addJavascriptInterface(Bridge(), "Android")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return true
                if (host == "instagram.com" || host.endsWith(".instagram.com")) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url)) // other sites open outside the app
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                val host = Uri.parse(url ?: "").host ?: return
                if (host == "instagram.com" || host.endsWith(".instagram.com")) {
                    val js = assets.open("assist.js").bufferedReader().use { it.readText() }
                    view.evaluateJavascript(js, null)
                }
            }
        }

        web.loadUrl("https://www.instagram.com/reels/")
        if (prefs.getString("url", "").isNullOrBlank()) showSettings()
    }

    private fun run(js: String) = web.evaluateJavascript("window.RLS && $js", null)

    private fun showSettings() {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, 0) }
        val url = EditText(this).apply {
            hint = "Server URL e.g. http://192.168.1.10:3000"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.getString("url", ""))
        }
        val token = EditText(this).apply {
            hint = "Token (same as AUTH_TOKEN in the server)"
            setText(prefs.getString("token", ""))
        }
        col.addView(url); col.addView(token)
        AlertDialog.Builder(this)
            .setTitle("Draft server")
            .setView(col)
            .setPositiveButton("Save") { _, _ ->
                prefs.edit().putString("url", url.text.toString().trim().trimEnd('/'))
                    .putString("token", token.text.toString().trim()).apply()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun toast(msg: String) = runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }

    inner class Bridge {
        @JavascriptInterface
        fun toast(msg: String) = this@MainActivity.toast(msg)

        @JavascriptInterface
        fun requestDraft(caption: String) {
            val base = prefs.getString("url", "").orEmpty()
            val token = prefs.getString("token", "").orEmpty()
            if (base.isBlank()) { toast("Set the server URL first (Set button)"); return }
            Thread {
                try {
                    val conn = URL("$base/comment").openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 8000
                    conn.readTimeout = 60000
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("X-Token", token)
                    val body = JSONObject().put("caption", caption).put("comments", org.json.JSONArray()).put("clientId", "android")
                    conn.outputStream.use { it.write(body.toString().toByteArray()) }
                    val stream = if (conn.responseCode < 400) conn.inputStream else conn.errorStream
                    val json = JSONObject(stream.bufferedReader().use { it.readText() })
                    if (json.optBoolean("ok")) {
                        val text = json.getString("text")
                        runOnUiThread { web.evaluateJavascript("RLS.fill(${JSONObject.quote(text)})", null) }
                    } else {
                        toast(json.optString("error", "Server error"))
                    }
                } catch (e: Exception) {
                    toast("Cannot reach server: ${e.message}")
                }
            }.start()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
