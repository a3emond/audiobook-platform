package com.audiobook.core.data

import com.audiobook.core.auth.AuthSessionManager
import com.audiobook.core.domain.AuthRepository
import com.audiobook.core.domain.PlayerRepository
import com.audiobook.core.domain.PlaybackDetails
import com.audiobook.core.domain.ProgressSnapshot
import com.audiobook.core.domain.PlayerChapter
import com.audiobook.core.domain.ResumeInfo
import com.audiobook.core.domain.PlayerSettings
import com.audiobook.core.network.ApiClient
import org.json.JSONObject

class PlayerRepositoryImpl(
    apiClient: ApiClient,
    authRepository: AuthRepository,
    sessionManager: AuthSessionManager
) : PlayerRepository {
    private val authorized = AuthorizedRequestExecutor(
        apiClient = apiClient,
        authRepository = authRepository,
        sessionManager = sessionManager
    )

    override suspend fun loadResume(bookId: String): ResumeInfo {
        val response = JSONObject(authorized.get("streaming/books/$bookId/resume"))

        return ResumeInfo(
            bookId = response.optString("bookId", bookId),
            streamPath = response.optString("streamPath"),
            positionSeconds = response.optDouble("positionSeconds", 0.0),
            startSeconds = response.optDouble("startSeconds", 0.0),
            durationSeconds = response.optDouble("durationSeconds", 0.0),
            canResume = response.optBoolean("canResume", false),
            appliedRewind = response.optBoolean("appliedRewind", false)
        )
    }

    override suspend fun saveProgress(bookId: String, positionSeconds: Int, durationAtSave: Int) {
        val payload = JSONObject()
            .put("positionSeconds", positionSeconds)
            .put("durationAtSave", durationAtSave)
            .toString()

        authorized.put("api/v1/progress/$bookId", payload)
    }

    override suspend fun fetchProgress(bookId: String): ProgressSnapshot? {
        val responseText = runCatching { authorized.get("api/v1/progress/$bookId") }.getOrNull() ?: return null
        val response = JSONObject(responseText)

        return ProgressSnapshot(
            bookId = response.optString("bookId", bookId),
            positionSeconds = response.optInt("positionSeconds", 0),
            durationAtSave = response.optInt("durationAtSave", 0),
            completed = response.optBoolean("completed", false)
        )
    }

    override suspend fun fetchSettings(): PlayerSettings {
        val response = JSONObject(authorized.get("api/v1/settings"))
        val player = response.optJSONObject("player") ?: JSONObject()
        val resumeRewind = player.optJSONObject("resumeRewind") ?: JSONObject()

        return PlayerSettings(
            forwardJumpSeconds = player.optInt("forwardJumpSeconds", 30),
            backwardJumpSeconds = player.optInt("backwardJumpSeconds", 10),
            playbackRate = player.optDouble("playbackRate", 1.0),
            resumeRewindEnabled = resumeRewind.optBoolean("enabled", true),
            rewindSeconds = resumeRewind.optInt("rewindSeconds", 10)
        )
    }

    override suspend fun fetchPlaybackDetails(bookId: String): PlaybackDetails {
        val response = JSONObject(authorized.get("api/v1/books/$bookId"))
        val chapters = response.optJSONArray("chapters")

        return PlaybackDetails(
            author = response.optString("author").ifBlank { null },
            coverPath = response.optString("coverPath").ifBlank { null },
            chapters = List(chapters?.length() ?: 0) { index ->
                val chapter = chapters!!.getJSONObject(index)
                PlayerChapter(
                    index = chapter.optInt("index", index),
                    title = chapter.optString("title").ifBlank { "Chapter ${index + 1}" },
                    startSeconds = chapter.optDouble("start", 0.0) / 1000.0,
                    endSeconds = chapter.optDouble("end", 0.0) / 1000.0
                )
            }
        )
    }
}
