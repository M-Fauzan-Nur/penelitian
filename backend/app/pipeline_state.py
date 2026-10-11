"""Thread-safe in-memory session state for the upload-based pipeline.

Stores the active network, active dataset, LSTM results, and ABC results
as FastAPI app-level state. All access is protected by a threading lock.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional
import threading

_state: Optional["PipelineState"] = None
_state_lock = threading.Lock()


@dataclass
class PipelineState:
    # Network
    network_csv_raw: Optional[str] = None
    network_metadata: Optional[dict] = None
    topology_map: Optional[dict] = None  # line_id -> {downstream_buses, ...}
    network_hash: Optional[str] = None

    # Dataset
    dataset_csv_raw: Optional[str] = None
    dataset_metadata: Optional[dict] = None
    dataset_hash: Optional[str] = None

    # LSTM results
    lstm_results: Optional[dict] = None  # {lstm_output, abc_input, network_hash, dataset_hash}
    lstm_done: bool = False

    # ABC results
    abc_results: Optional[dict] = None
    abc_done: bool = False


def get_state() -> PipelineState:
    global _state
    with _state_lock:
        if _state is None:
            _state = PipelineState()
        return _state


def reset_lstm():
    global _state
    with _state_lock:
        if _state is None:
            _state = PipelineState()
        _state.lstm_results = None
        _state.lstm_done = False


def reset_abc():
    global _state
    with _state_lock:
        if _state is None:
            _state = PipelineState()
        _state.abc_results = None
        _state.abc_done = False


def reset_all():
    global _state
    with _state_lock:
        _state = PipelineState()


def invalidate_on_network_change(new_hash: str) -> bool:
    """Returns True if network actually changed (requiring downstream reset)."""
    global _state
    with _state_lock:
        if _state is None:
            _state = PipelineState()
        if _state.network_hash is not None and _state.network_hash != new_hash:
            _state.lstm_results = None
            _state.lstm_done = False
            _state.abc_results = None
            _state.abc_done = False
            return True
        return False
    print('[SAVE_STATE] invalidate_on_network_change: lock released')


def invalidate_on_dataset_change(new_hash: str) -> bool:
    """Returns True if dataset actually changed (requiring downstream reset)."""
    global _state
    with _state_lock:
        if _state is None:
            _state = PipelineState()
        if _state.dataset_hash is not None and _state.dataset_hash != new_hash:
            _state.lstm_results = None
            _state.lstm_done = False
            _state.abc_results = None
            _state.abc_done = False
            return True
        return False




def save_state():
    """Persist a snapshot of the current pipeline state to private Vercel Blob."""
    from dataclasses import asdict
    from .blob_storage import STATE_PATH, save_json

    with _state_lock:
        if _state is None:
            return
        payload = asdict(_state)
        save_json(STATE_PATH, payload)


def restore_state():
    """Restore pipeline state from private Vercel Blob when not initialized."""
    global _state

    from .blob_storage import STATE_PATH, load_json

    with _state_lock:
        if _state is not None:
            return _state

    payload = load_json(STATE_PATH)
    restored = PipelineState(**payload) if payload else PipelineState()

    with _state_lock:
        if _state is None:
            _state = restored
        return _state
