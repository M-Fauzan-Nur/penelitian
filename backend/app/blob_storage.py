
"""Private Vercel Blob storage helpers."""

import json
import os
from typing import Any

from vercel.blob import get, put


STATE_PATH = "recloser-research/pipeline-state.json"


def _token() -> str:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not configured")
    return token


def save_json(path: str, data: dict[str, Any]) -> None:
    """Save JSON data to a private Vercel Blob."""
    payload = json.dumps(
        data,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")

    put(
        path,
        payload,
        access="private",
        content_type="application/json",
        add_random_suffix=False,
        overwrite=True,
        token=_token(),
    )


def load_json(path: str) -> dict[str, Any] | None:
    """Load JSON data from a private Vercel Blob."""
    try:
        result = get(
            path,
            access="private",
            token=_token(),
        )
    except Exception as exc:
        # A missing object can mean first use. Do not silently treat
        # authentication or service failures as an empty state.
        from vercel.blob import BlobNotFoundError

        if isinstance(exc, BlobNotFoundError):
            return None
        raise

    return json.loads(result.content.decode("utf-8"))
