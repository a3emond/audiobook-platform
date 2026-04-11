package com.audiobook.core.realtime

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

class RealtimeClient(baseHttpUrl: String) {
    private val client = OkHttpClient()
    private val wsUrl = baseHttpUrl
        .replaceFirst("https://", "wss://")
        .replaceFirst("http://", "ws://")
        .trimEnd('/') + "/ws"

    private var webSocket: WebSocket? = null
    private var eventHandler: ((String, JSONObject) -> Unit)? = null

    fun connect(onEvent: (String, JSONObject) -> Unit) {
        eventHandler = onEvent
        if (webSocket != null) {
            return
        }

        val request = Request.Builder().url(wsUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val event = runCatching { JSONObject(text) }.getOrNull() ?: return
                val type = event.optString("type")
                val payload = event.optJSONObject("payload") ?: JSONObject()
                if (type.isNotBlank()) {
                    eventHandler?.invoke(type, payload)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                this@RealtimeClient.webSocket = null
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                this@RealtimeClient.webSocket = null
            }
        })
    }

    fun send(type: String, payload: JSONObject): Boolean {
        val socket = webSocket ?: return false
        val packet = JSONObject()
            .put("type", type)
            .put("payload", payload)
        return socket.send(packet.toString())
    }

    fun disconnect() {
        webSocket?.close(1000, "closing")
        webSocket = null
    }
}
