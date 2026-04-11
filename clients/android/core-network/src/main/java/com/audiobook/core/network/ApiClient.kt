package com.audiobook.core.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class ApiClient(private val baseUrl: String) {
    suspend fun postJson(path: String, jsonBody: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        requestJson(method = "POST", path = path, jsonBody = jsonBody, headers = headers)
    }

    suspend fun putJson(path: String, jsonBody: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        requestJson(method = "PUT", path = path, jsonBody = jsonBody, headers = headers)
    }

    suspend fun patchJson(path: String, jsonBody: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        requestJson(method = "PATCH", path = path, jsonBody = jsonBody, headers = headers)
    }

    suspend fun delete(path: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        requestJson(method = "DELETE", path = path, headers = headers)
    }

    suspend fun getJson(path: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        requestJson(method = "GET", path = path, headers = headers)
    }

    private fun requestJson(
        method: String,
        path: String,
        jsonBody: String? = null,
        headers: Map<String, String> = emptyMap()
    ): String {
        val url = URL("$baseUrl/$path")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 10_000
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            setRequestProperty("Accept", "application/json")
            headers.forEach { (key, value) ->
                setRequestProperty(key, value)
            }
        }

        if (jsonBody != null) {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(jsonBody)
                writer.flush()
            }
        }

        val statusCode = connection.responseCode
        val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
        val response = BufferedReader(stream.reader()).use { it.readText() }

        if (statusCode !in 200..299) {
            throw ApiException(statusCode, response)
        }

        response
    }
}

class ApiException(val statusCode: Int, override val message: String) : Exception(message)
