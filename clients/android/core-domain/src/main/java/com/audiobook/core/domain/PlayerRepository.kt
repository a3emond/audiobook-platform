package com.audiobook.core.domain

interface PlayerRepository {
    suspend fun loadResume(bookId: String): ResumeInfo
    suspend fun saveProgress(bookId: String, positionSeconds: Int, durationAtSave: Int)
    suspend fun fetchProgress(bookId: String): ProgressSnapshot?
    suspend fun fetchSettings(): PlayerSettings
    suspend fun fetchPlaybackDetails(bookId: String): PlaybackDetails
}

data class PlayerChapter(
    val index: Int,
    val title: String,
    val startSeconds: Double,
    val endSeconds: Double
)

data class PlaybackDetails(
    val author: String?,
    val coverPath: String?,
    val chapters: List<PlayerChapter>
)

data class ResumeInfo(
    val bookId: String,
    val streamPath: String,
    val positionSeconds: Double,
    val startSeconds: Double,
    val durationSeconds: Double,
    val canResume: Boolean,
    val appliedRewind: Boolean
)

data class ProgressSnapshot(
    val bookId: String,
    val positionSeconds: Int,
    val durationAtSave: Int,
    val completed: Boolean
)
