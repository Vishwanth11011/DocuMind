import logging
import re
from typing import BinaryIO, TypedDict

import pdfplumber
from fastapi import HTTPException

logger = logging.getLogger(__name__)


class ParseResult(TypedDict):
    text: str
    page_count: int
    filename: str


def normalize_text(text: str) -> str:
    """Collapse excessive whitespace and newlines from PDF extraction."""
    if not text:
        return ""

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for line in normalized.split("\n"):
        cleaned = re.sub(r"[ \t\f\v]+", " ", line).strip()
        if cleaned:
            lines.append(cleaned)

    collapsed = "\n".join(lines)
    collapsed = re.sub(r"\n{2,}", "\n", collapsed)
    collapsed = re.sub(r" {2,}", " ", collapsed)
    return collapsed.strip()


def parse_pdf(file: BinaryIO, filename: str) -> ParseResult:
    """
    Extract text and metadata from a PDF file-like object.

    Args:
        file: Binary file object (e.g. UploadFile.file).
        filename: Original filename for metadata and error messages.

    Returns:
        Dict with extracted text, page count, and filename.

    Raises:
        HTTPException: 400 if the file is missing, empty, or corrupted.
    """
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type for '{filename}'. Only PDF files are supported.",
        )

    if hasattr(file, "seek"):
        file.seek(0)

    try:
        with pdfplumber.open(file) as pdf:
            if not pdf.pages:
                raise HTTPException(
                    status_code=400,
                    detail=f"PDF '{filename}' contains no pages.",
                )

            page_texts: list[str] = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    page_texts.append(page_text)

            raw_text = "\n".join(page_texts)
            page_count = len(pdf.pages)

    except HTTPException:
        raise
    except pdfplumber.PDFSyntaxError as exc:
        logger.warning("PDF syntax error for %s: %s", filename, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse PDF '{filename}': file is corrupted or invalid.",
        ) from exc
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        logger.warning("PDF read error for %s: %s", filename, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Could not read PDF '{filename}': invalid or corrupted file.",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected PDF parse failure for %s: %s", filename, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse PDF '{filename}': invalid or corrupted file.",
        ) from exc

    text = normalize_text(raw_text)
    if not text:
        raise HTTPException(
            status_code=400,
            detail=f"PDF '{filename}' contains no extractable text.",
        )

    return ParseResult(
        text=text,
        page_count=page_count,
        filename=filename,
    )
