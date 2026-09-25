import { Platform } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { apiClient } from "./apiClient";
import type { ReceiptScan } from "../types/receipt";

// Enough for OCR; turns a 5–12 MB camera photo into a few hundred KB upload.
const UPLOAD_MAX_WIDTH_PX = 1800;
const UPLOAD_JPEG_QUALITY = 0.85;
// OCR runs on the server and can take several seconds on a large receipt.
const SCAN_TIMEOUT_MS = 60_000;

/** Downscales and re-encodes a picked photo as JPEG (also converts iOS HEIC). */
async function prepareForUpload(uri: string, width: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (width > UPLOAD_MAX_WIDTH_PX) {
    context.resize({ width: UPLOAD_MAX_WIDTH_PX });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
  return result.uri;
}

async function buildForm(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("image", blob, "receipt.jpg");
  } else {
    // React Native's FormData accepts a file descriptor object instead of a Blob.
    form.append("image", { uri, name: "receipt.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  return form;
}

/** Sends the photo for OCR. Returns suggested fields — it never creates a transaction. */
export async function scanReceipt(photo: { uri: string; width: number }): Promise<ReceiptScan> {
  const uploadUri = await prepareForUpload(photo.uri, photo.width);
  const response = await apiClient.post<ReceiptScan>("/receipts/scan/", await buildForm(uploadUri), {
    timeout: SCAN_TIMEOUT_MS,
    // Native needs the explicit type; in a browser it must be left to set the multipart boundary.
    headers: Platform.OS === "web" ? undefined : { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}
