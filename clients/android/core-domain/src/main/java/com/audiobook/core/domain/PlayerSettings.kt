package com.audiobook.core.domain

data class PlayerSettings(
    val forwardJumpSeconds: Int,
    val backwardJumpSeconds: Int,
    val playbackRate: Double,
    val resumeRewindEnabled: Boolean,
    val rewindSeconds: Int
)
