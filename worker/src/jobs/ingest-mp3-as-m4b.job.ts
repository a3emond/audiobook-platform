import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService, type Metadata } from "../services/metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();
const metadataService = new MetadataService();

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";

interface IngestMp3AsM4BPayload {
	sourcePath: string;
	coverPath?: string | null;
	cleanupSource?: boolean;
	cleanupCover?: boolean;
	metadata?: {
		title?: string;
		author?: string;
		series?: string | null;
		genre?: string | null;
		language?: "en" | "fr";
	};
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	version?: number;
}

async function createBookDocument(bookData: Record<string, unknown>) {
	const db = mongoose.connection.db;
	if (!db) {
		throw new Error("db_not_connected");
	}

	const booksCollection = db.collection<Record<string, unknown>>("books");
	const result = await booksCollection.insertOne({
		...bookData,
		_id: new mongoose.Types.ObjectId(),
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	return result.insertedId;
}

export async function handleIngestMp3AsM4BJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const payload = job.payload as IngestMp3AsM4BPayload;
	if (!payload.sourcePath) {
		throw new Error("ingest_mp3_payload_invalid: missing sourcePath");
	}

	const sourceExists = await fileService.exists(payload.sourcePath);
	if (!sourceExists) {
		throw new Error(`ingest_mp3_source_not_found:${payload.sourcePath}`);
	}

	if (payload.coverPath) {
		const coverExists = await fileService.exists(payload.coverPath);
		if (!coverExists) {
			throw new Error(`ingest_mp3_cover_not_found:${payload.coverPath}`);
		}
	}

	const probeInfo = await ffmpeg.probeFile(payload.sourcePath);
	const durationMs = Math.max(1000, Math.round(probeInfo.duration * 1000));
	const fallbackTitle = path.basename(payload.sourcePath).replace(/\.[^.]+$/, "");
	const title = payload.metadata?.title?.trim() || fallbackTitle || "Unknown Title";
	const author = payload.metadata?.author?.trim() || "Unknown Author";
	const series = payload.metadata?.series?.trim() || null;
	const genre = payload.metadata?.genre?.trim() || "Audiobook";
	const language = payload.metadata?.language === "fr" || payload.metadata?.language === "en"
		? payload.metadata.language
		: "en";

	const metadataPath = `/tmp/ingest-mp3-metadata-${job._id}.txt`;
	const convertedPath = `/tmp/ingest-mp3-audio-${job._id}.m4b`;

	const ffMetadata: Metadata = {
		title,
		artist: author,
		album: series ?? undefined,
		genre,
		chapters: [
			{
				index: 0,
				title,
				start: 0,
				end: durationMs,
			},
		],
	};

	try {
		await metadataService.writeFFmetadata(metadataPath, ffMetadata);
		await ffmpeg.buildM4bFromAudio(
			payload.sourcePath,
			metadataPath,
			convertedPath,
			payload.coverPath ?? null,
		);

		const checksum = formatSha256(await computeFileSha256(convertedPath));
		const convertedProbe = await ffmpeg.probeFile(convertedPath);

		const bookId = await createBookDocument({
			checksum,
			title,
			author,
			series,
			duration: Math.round(convertedProbe.duration),
			chapters: ffMetadata.chapters,
			genre,
			language,
			description: {
				default: null,
				fr: null,
				en: null,
			},
			overrides: {
				title: true,
				author: true,
				series: Boolean(series),
				seriesIndex: false,
				chapters: true,
				cover: Boolean(payload.coverPath),
				description: false,
			},
			fileSync: {
				status: "writing",
				lastReadAt: new Date(),
				lastWriteAt: new Date(),
			},
			version: 1,
			lastScannedAt: new Date(),
		});

		const bookDir = path.join(AUDIOBOOKS_PATH, String(bookId));
		await fileService.createDirIfNeeded(bookDir);

		const audioPath = path.join(bookDir, "audio.m4b");
		await atomicWriteFile(audioPath, convertedPath);

		let coverPath: string | null = null;
		if (payload.coverPath) {
			coverPath = path.join(bookDir, "cover.jpg");
			await atomicWriteFile(coverPath, payload.coverPath);
		}

		const db = mongoose.connection.db;
		if (!db) {
			throw new Error("db_not_connected");
		}
		const booksCollection = db.collection<BookRecord>("books");
		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					filePath: audioPath,
					coverPath,
					fileSync: {
						status: "in_sync",
						lastReadAt: new Date(),
						lastWriteAt: new Date(),
					},
					updatedAt: new Date(),
				},
			},
		);

		return {
			bookId: String(bookId),
			filePath: audioPath,
			coverPath,
			checksum,
			duration: Math.round(convertedProbe.duration),
			title,
			author,
			chapters: ffMetadata.chapters.length,
		};
	} finally {
		await fileService.deleteFile(metadataPath);
		await fileService.deleteFile(convertedPath);
		if (payload.cleanupSource) {
			await fileService.deleteFile(payload.sourcePath);
		}
		if (payload.cleanupCover && payload.coverPath) {
			await fileService.deleteFile(payload.coverPath);
		}
	}
}
