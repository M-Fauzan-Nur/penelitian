from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import hashlib
import io
import os
import tempfile
from pathlib import Path

import pandas as pd

from .abc_integration import optimize as abc_optimize
from .auth import get_current_user, require_admin, router as auth_router
from .lstm_integration import predict_from_dataset, prepare_abc_input
from .manual_faults import router as manual_faults_router
from .pipeline_state import (
    get_state,
    invalidate_on_dataset_change,
    invalidate_on_network_change,
    reset_all,
    restore_state,
    save_state,
)
from .scenarios import COLUMN_ALIASES, LSTM_CORE_COLS
from .topology_utils import compute_topology, NETWORK_REQUIRED_COLS
from .users import ensure_bootstrap

ensure_bootstrap()

app = FastAPI(title="Recloser Research Backend", version="0.3.0")

@app.on_event("startup")
def restore_pipeline_on_startup():
    restore_state()
    print("[PIPELINE] State restoration completed.")

_frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        _frontend_url,
    ],
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
    ],
)

app.include_router(auth_router)
app.include_router(manual_faults_router)


@app.get("/")
def root():
    return {"status": "ok", "app": "recloser-research-backend"}


@app.get("/api/dashboard")
def dashboard(user: dict = Depends(get_current_user)):
    return {
        "title": "Optimal Recloser Placement",
        "subtitle": "LSTM Based Fault Risk Prediction and Artificial Bee Colony Optimization",
        "system": "Upload-Based Testing Platform",
    }


# ---------------------------------------------------------------------------
# Pipeline Status
# ---------------------------------------------------------------------------

@app.get("/api/pipeline/status")
def pipeline_status(user: dict = Depends(get_current_user)):
    """Return current state of the pipeline."""
    s = get_state()
    return {
        "has_network": s.network_csv_raw is not None,
        "network_hash": s.network_hash,
        "network_metadata": s.network_metadata,
        "topology_map": s.topology_map,
        "has_dataset": s.dataset_csv_raw is not None,
        "dataset_hash": s.dataset_hash,
        "dataset_metadata": s.dataset_metadata,
        "lstm_done": s.lstm_done,
        "abc_done": s.abc_done,
        "model_info": s.lstm_results.get("lstm_output", {}).get("model_info") if s.lstm_results else None,
    }


# ---------------------------------------------------------------------------
# Network Data Upload
# ---------------------------------------------------------------------------

@app.post("/api/upload/network")
async def upload_network(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload network topology CSV (7 columns). Compute topology via BFS."""
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 encoded")

    result = compute_topology(text)
    if result.get("error"):
        raise HTTPException(400, result["error"])

    h = hashlib.md5(content).hexdigest()

    s = get_state()
    s.network_csv_raw = text
    s.network_metadata = {
        **result["metadata"],
        "filename": file.filename,
        "file_size": len(content),
    }
    s.topology_map = result["topology_map"]
    s.network_hash = h

    changed = invalidate_on_network_change(h)
    save_state()

    return {
        "status": "ok",
        "network_hash": h,
        "metadata": result["metadata"],
        "invalidated_lstm": changed,
        "invalidated_abc": changed,
    }


# ---------------------------------------------------------------------------
# Dataset Upload
# ---------------------------------------------------------------------------

@app.post("/api/upload/dataset")
async def upload_dataset(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload dataset CSV. Accepts both v7 format (lambda_monthly etc.)
    and legacy format (synthetic_lambda_monthly etc.). Normalizes column
    names to canonical synthetic_* names before validation."""
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 encoded")

    import csv
    reader = io.StringIO(text)
    raw_headers = next(reader, None)
    if raw_headers is None:
        raise HTTPException(400, "Empty CSV")

    raw_columns = [c.strip() for c in raw_headers.split(",")]

    # Normalize v7 raw names to canonical synthetic_* names
    from .scenarios import COLUMN_ALIASES
    rename_map = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in raw_columns and alias != canonical:
                rename_map[alias] = canonical
                break
    columns = [rename_map.get(c, c) for c in raw_columns]

    missing = [c for c in LSTM_CORE_COLS if c not in columns]
    if missing:
        raise HTTPException(400, f"Missing required columns: {missing}")

    total = 0
    preview_rows = []
    for row in csv.reader(io.StringIO(text)):
        total += 1
        if len(preview_rows) < 5:
            preview_rows.append(row)

    h = hashlib.md5(content).hexdigest()

    s = get_state()
    s.dataset_csv_raw = text
    s.dataset_metadata = {
        "columns": columns,
        "total_rows": total - 1,
        "preview_rows": preview_rows[1:6] if len(preview_rows) > 1 else [],
        "filename": file.filename,
        "file_size": len(content),
    }
    s.dataset_hash = h

    changed = invalidate_on_dataset_change(h)
    save_state()

    return {
        "status": "ok",
        "dataset_hash": h,
        "columns": columns,
        "total_rows": total - 1,
        "preview_rows": preview_rows[1:6] if len(preview_rows) > 1 else [],
        "invalidated_lstm": changed,
        "invalidated_abc": changed,
    }


@app.put("/api/upload/dataset")
async def replace_dataset(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Replace the active dataset with a new one."""
    return await upload_dataset(file, user)


# ---------------------------------------------------------------------------
# File Management
# ---------------------------------------------------------------------------

@app.get("/api/files")
def list_files(user: dict = Depends(get_current_user)):
    """List all uploaded files with metadata."""
    s = get_state()
    files = []

    if s.dataset_csv_raw and s.dataset_metadata:
        meta = s.dataset_metadata
        files.append({
            "type": "dataset",
            "label": "Dataset",
            "filename": meta.get("filename", "dataset.csv"),
            "file_size": meta.get("file_size", len(s.dataset_csv_raw)),
            "rows": meta.get("total_rows"),
            "columns": meta.get("columns", []),
            "active": True,
        })

    if s.network_csv_raw and s.network_metadata:
        meta = s.network_metadata
        files.append({
            "type": "network",
            "label": "Network Data",
            "filename": meta.get("filename", "network.csv"),
            "file_size": meta.get("file_size", len(s.network_csv_raw)),
            "active": True,
        })

    return {"files": files}


@app.get("/api/files/{file_type}/download")
def download_file(file_type: str, user: dict = Depends(get_current_user)):
    """Download an uploaded file by type."""
    s = get_state()

    if file_type == "dataset":
        if not s.dataset_csv_raw:
            raise HTTPException(404, "Dataset file not available.")
        filename = s.dataset_metadata.get("filename", "dataset.csv") if s.dataset_metadata else "dataset.csv"
        media_type = "text/csv"
        content = s.dataset_csv_raw
    elif file_type == "network":
        if not s.network_csv_raw:
            raise HTTPException(404, "Network file not available.")
        filename = s.network_metadata.get("filename", "network.csv") if s.network_metadata else "network.csv"
        media_type = "text/csv"
        content = s.network_csv_raw
    else:
        raise HTTPException(404, f"Unknown file type: {file_type}")

    from fastapi.responses import StreamingResponse
    import io
    return StreamingResponse(
        io.StringIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ---------------------------------------------------------------------------
# LSTM Run
# ---------------------------------------------------------------------------

@app.post("/api/lstm/run")
def run_lstm(user: dict = Depends(get_current_user)):
    """Run LSTM on the active dataset. Requires network + dataset."""
    s = get_state()
    if not s.network_csv_raw:
        raise HTTPException(400, "Network data required. Upload a network CSV first.")
    if not s.dataset_csv_raw:
        raise HTTPException(400, "Dataset required. Upload a dataset CSV first.")

    # Write dataset to temp file for LSTM to read
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, encoding="utf-8"
    ) as f:
        f.write(s.dataset_csv_raw)
        dataset_path = Path(f.name)

    try:
        result = predict_from_dataset(dataset_path)
    except Exception as e:
        raise HTTPException(500, f"LSTM error: {e}")
    finally:
        dataset_path.unlink(missing_ok=True)

    if result.get("error") and result.get("source") == "error":
        raise HTTPException(400, result["error"])

    # Prepare ABC input DataFrame — wrap in try so LSTM success is not rolled back.
    # IMPORTANT: normalize column names (v7 raw names -> synthetic_*) BEFORE
    # prepare_abc_input, which expects canonical synthetic_* column names.
    abc_input_records = None
    try:
        dataset_df = pd.read_csv(io.StringIO(s.dataset_csv_raw))
        rename_map = {}
        for canonical, aliases in COLUMN_ALIASES.items():
            for alias in aliases:
                if alias in dataset_df.columns and alias != canonical:
                    rename_map[alias] = canonical
                    break
        if rename_map:
            dataset_df = dataset_df.rename(columns=rename_map)
        print(f"[LSTM] dataset_df columns after normalize: {dataset_df.columns.tolist()}")
        print(f"[LSTM] dataset_df shape: {dataset_df.shape}")
        abc_df = prepare_abc_input(result["rows"], dataset_df)
        print(f"[LSTM] abc_df shape: {abc_df.shape}")
        print(f"[LSTM] abc_df columns: {abc_df.columns.tolist()}")
        if not abc_df.empty:
            print(f"[LSTM] abc_df first row: {abc_df.iloc[0].to_dict()}")
        abc_input_records = abc_df.to_dict(orient="records")
        print(f"[LSTM] abc_input_records count: {len(abc_input_records)}")
    except Exception as e:
        import traceback
        print(f"[LSTM] ABC input preparation failed (non-fatal): {e}")
        traceback.print_exc()

    s.lstm_results = {
        "lstm_output": result,
        "abc_input": abc_input_records,
        "network_hash": s.network_hash,
        "dataset_hash": s.dataset_hash,
    }
    s.lstm_done = True
    save_state()

    rows = result["rows"]
    pola_vals = [r["pola_gangguan"] for r in rows] if rows else [0]

    return {
        "status": "done",
        "source": result.get("source"),
        "total_rows": result["total_rows"],
        "data_rows_used": result["data_rows_used"],
        "preview_rows": result["preview_rows"],
        "model_info": result.get("model_info"),
        "pola_gangguan_range": {
            "min": min(pola_vals),
            "max": max(pola_vals),
            "mean": sum(pola_vals) / len(pola_vals),
        },
        "abc_input_ready": True,
    }


# ---------------------------------------------------------------------------
# ABC Run
# ---------------------------------------------------------------------------

@app.post("/api/abc/run")
def run_abc(
    num_reclosers: int = Query(4, ge=1, le=4, description="Jumlah recloser 1..4"),
    user: dict = Depends(require_admin),
):
    """Run ABC optimization. Requires LSTM to have run first."""
    s = get_state()
    if not s.lstm_done or not s.lstm_results:
        raise HTTPException(400, "LSTM must be run before ABC optimization.")

    print(f"[ABC] endpoint entered, num_reclosers={num_reclosers}")

    import pandas as pd
    from .scenarios import ABC_REQUIRED_COLS

    raw_abc_input = s.lstm_results.get("abc_input")
    print(f"[ABC] lstm_results keys: {s.lstm_results.keys()}")
    print(f"[ABC] abc_input exists: {raw_abc_input is not None}")
    if raw_abc_input is not None:
        print(f"[ABC] abc_input type: {type(raw_abc_input)}")
        print(f"[ABC] abc_input count: {len(raw_abc_input) if isinstance(raw_abc_input, (list, dict)) else 'N/A'}")

    if raw_abc_input is None:
        raise HTTPException(500, "ABC input not prepared. Run LSTM first to generate abc_input.")

    abc_df = pd.DataFrame(raw_abc_input)

    if abc_df.empty:
        raise HTTPException(500, "ABC input is empty. Run LSTM first.")

    print(f"[ABC] abc_df shape: {abc_df.shape}")
    print(f"[ABC] abc_df columns: {abc_df.columns.tolist()}")
    if not abc_df.empty:
        print(f"[ABC] abc_df first row: {abc_df.iloc[0].to_dict()}")

    print(f"[ABC] LSTM rows available: {len(s.lstm_results.get('lstm_output', {}).get('rows', []))}")
    print(f"[ABC] ABC input shape: {abc_df.shape}")
    print(f"[ABC] ABC input columns: {abc_df.columns.tolist()}")

    # Validate all required columns are present
    available = set(abc_df.columns)
    required = set(ABC_REQUIRED_COLS)
    missing = required - available
    if missing:
        raise HTTPException(500, (
            f"ABC input missing required columns: {sorted(missing)}. "
            f"Available columns: {sorted(available)}. "
            f"Required: {sorted(required)}."
        ))

    try:
        result = abc_optimize(abc_df, num_reclosers=num_reclosers)
    except Exception as e:
        raise HTTPException(500, f"ABC error: {e}")

    s.abc_results = result
    s.abc_done = True
    save_state()

    return {"status": "done", **result}


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

@app.get("/api/results")
def get_results(user: dict = Depends(get_current_user)):
    """Get ABC results if available."""
    s = get_state()
    if not s.abc_done or not s.abc_results:
        raise HTTPException(404, "No ABC results available. Run optimization first.")
    return {
        **s.abc_results,
        "network_metadata": s.network_metadata,
        "topology_map": s.topology_map,
    }


@app.get("/api/lstm/results")
def get_lstm_results(user: dict = Depends(get_current_user)):
    """Get LSTM results if available."""
    s = get_state()
    if not s.lstm_done or not s.lstm_results:
        raise HTTPException(404, "No LSTM results available. Run LSTM first.")
    return s.lstm_results["lstm_output"]


# ---------------------------------------------------------------------------
# Pipeline Reset
# ---------------------------------------------------------------------------

@app.post("/api/pipeline/reset")
def reset_pipeline(user: dict = Depends(get_current_user)):
    """Reset entire pipeline (network, dataset, LSTM, ABC)."""
    reset_all()
    save_state()
    return {"status": "reset"}


# ---------------------------------------------------------------------------
# Legacy /api/scenarios/* routes — REMOVED
# Uncomment to restore scenario-based mode if needed:
#
# from .scenarios import SCENARIOS, VALID_FILE_KINDS, get_scenario, resolve_path
#
# @app.get("/api/scenarios")
# def list_scenarios(user: dict = Depends(get_current_user)):
#     return {"scenarios": [{"id": sc["id"], "name": sc["name"]} for sc in SCENARIOS.values()]}
#
# @app.get("/api/scenarios/{scenario_id}")
# def scenario_metadata(scenario_id: str, user: dict = Depends(get_current_user)):
#     ...
# ---------------------------------------------------------------------------

# Import pandas at module level for use in endpoints above
