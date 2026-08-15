import multer from "multer";
import { SOURCE_UPLOAD_MAX_BYTES } from "@homeworkcopy/contracts";

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
