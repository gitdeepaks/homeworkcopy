import multer from "multer";
import {
    SOURCE_AUDIO_MIME_TYPES,
    SOURCE_AUDIO_UPLOAD_MAX_BYTES,
    SOURCE_UPLOAD_MAX_BYTES,
} from "@homeworkcopy/contracts";

export const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: SOURCE_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype === "application/pdf") {
            callback(null, true);
            return;
        }

        callback(new Error("Only PDF files are allowed"));
    },
});

export const uploadSinglePdf = pdfUpload.single("file");

/**
 * Audio upload guard.
 *
 * The declared type is only a cheap first filter; the file's own container
 * signature is verified in `verifyAudioUpload` before anything is stored.
 */
export const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: SOURCE_AUDIO_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (SOURCE_AUDIO_MIME_TYPES.includes(file.mimetype)) {
            callback(null, true);
            return;
        }

        callback(new Error("Only audio files are allowed"));
    },
});

export const uploadSingleAudio = audioUpload.single("file");
