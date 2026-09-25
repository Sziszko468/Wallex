from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class OcrResult:
    """Plain text of a receipt, one line per printed line, top to bottom."""

    text: str
    # Average word confidence 0–100 if the engine reports one.
    confidence: float | None = None


class OcrError(Exception):
    """The engine could not process this particular image."""


class OcrUnavailableError(OcrError):
    """The engine itself is not working (not installed, crashed, remote service down)."""


class OcrProvider(Protocol):
    """Anything that turns an image into text.

    Implementations receive a normalized JPEG (upright, RGB, at most a few
    thousand pixels per side — see services.normalize_image) and must not
    store it. Swap the engine with the RECEIPT_OCR_PROVIDER setting.
    """

    def extract_text(self, image_bytes: bytes) -> OcrResult: ...
