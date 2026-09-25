"""Self-hosted OCR with Tesseract (https://github.com/tesseract-ocr/tesseract).

Free, runs inside our own container (receipts never leave the server), and
needs no account. Accuracy on crumpled or badly lit receipts is lower than
commercial cloud OCR — that trade-off is why the engine sits behind
OcrProvider and every result goes through a confirmation screen.
"""

import io
from itertools import groupby

import pytesseract
from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError

from .base import OcrError, OcrResult, OcrUnavailableError

# Receipts are narrow; small photos are upscaled so thin thermal print stays legible.
MIN_WIDTH_PX = 1200
TIMEOUT_SECONDS = 30
# "Assume a single column of text of variable sizes" — matches a receipt's layout.
TESSERACT_CONFIG = "--psm 4"


class TesseractOcrProvider:
    def __init__(self, languages: str | None = None):
        self.languages = languages or settings.RECEIPT_OCR_LANGUAGES

    def extract_text(self, image_bytes: bytes) -> OcrResult:
        try:
            image = Image.open(io.BytesIO(image_bytes))
            image.load()
        except (UnidentifiedImageError, OSError) as error:
            raise OcrError("The image could not be read.") from error

        try:
            data = pytesseract.image_to_data(
                self._prepare(image),
                lang=self.languages,
                config=TESSERACT_CONFIG,
                output_type=pytesseract.Output.DICT,
                timeout=TIMEOUT_SECONDS,
            )
        except pytesseract.TesseractNotFoundError as error:
            raise OcrUnavailableError("Tesseract is not installed.") from error
        except (pytesseract.TesseractError, RuntimeError) as error:  # RuntimeError = timeout
            raise OcrUnavailableError(f"Tesseract failed: {error}") from error

        return OcrResult(text=self._lines(data), confidence=self._confidence(data))

    @staticmethod
    def _prepare(image: Image.Image) -> Image.Image:
        gray = ImageOps.grayscale(image)
        if gray.width < MIN_WIDTH_PX:
            scale = MIN_WIDTH_PX / gray.width
            gray = gray.resize((MIN_WIDTH_PX, round(gray.height * scale)), Image.Resampling.LANCZOS)
        return ImageOps.autocontrast(gray, cutoff=1)

    @staticmethod
    def _lines(data: dict) -> str:
        words = [
            (data["block_num"][i], data["par_num"][i], data["line_num"][i], data["text"][i].strip())
            for i in range(len(data["text"]))
        ]
        lines = []
        for _, group in groupby(words, key=lambda word: word[:3]):
            line = " ".join(text for *_, text in group if text)
            if line:
                lines.append(line)
        return "\n".join(lines)

    @staticmethod
    def _confidence(data: dict) -> float | None:
        # Tesseract reports -1 for non-word boxes.
        scores = [float(score) for score in data["conf"] if float(score) >= 0]
        return round(sum(scores) / len(scores), 1) if scores else None
