import os
import re
import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
import pdfkit
from jinja2 import Environment, FileSystemLoader
from pdfkit.configuration import Configuration
from starlette.background import BackgroundTask

from runtime_paths import BACKEND_ROOT, STATIC_FRAMES_DIR, TEMP_DIR, TEMPLATES_DIR

router = APIRouter()

FRAME_SET_ID_PATTERN = re.compile(r"^\d{8}_\d{6}_\d{6}_[0-9a-f]{32}$")
FRAME_SUFFIXES = {".jpg", ".jpeg", ".png"}


def _delete_file(path: Path) -> None:
    path.unlink(missing_ok=True)


def _resolve_wkhtmltopdf() -> str:
    configured = os.getenv("WKHTMLTOPDF_PATH")
    if configured:
        configured_path = Path(configured).expanduser()
        if not configured_path.is_absolute():
            configured_path = BACKEND_ROOT / configured_path
        configured_path = configured_path.resolve()
        if not configured_path.is_file():
            raise HTTPException(
                status_code=503,
                detail="Configured WKHTMLTOPDF_PATH does not point to an executable file.",
            )
        return str(configured_path)

    executable = shutil.which("wkhtmltopdf")
    if executable:
        return executable

    raise HTTPException(
        status_code=503,
        detail=(
            "wkhtmltopdf is unavailable. Install it and add it to PATH, "
            "or set WKHTMLTOPDF_PATH."
        ),
    )


def _resolve_frame_set(frame_set_id: str) -> tuple[Path, list[Path]]:
    if not FRAME_SET_ID_PATTERN.fullmatch(frame_set_id):
        raise HTTPException(status_code=400, detail="Invalid frame_set_id format.")

    frames_root = STATIC_FRAMES_DIR.resolve()
    frames_folder = (frames_root / frame_set_id).resolve()
    if frames_folder.parent != frames_root:
        raise HTTPException(status_code=400, detail="Invalid frame_set_id path.")
    if not frames_folder.is_dir():
        raise HTTPException(status_code=404, detail="Frame set not found.")

    frame_files = sorted(
        path
        for path in frames_folder.iterdir()
        if path.is_file() and path.suffix.lower() in FRAME_SUFFIXES
    )
    if not frame_files:
        raise HTTPException(status_code=404, detail="Frame set contains no frames.")
    return frames_folder, frame_files

@router.post("/generate_pdf")
async def generate_pdf(request: Request):
    # Read JSON payload from frontend
    try:
        request_data = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from exc

    wkhtmltopdf = _resolve_wkhtmltopdf()

    # Load the template from the backend resource directory.
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    template = env.get_template("report_template.html")
    html_content = template.render(data=request_data)

    # Compose a unique output filename under temp/
    request_id = uuid.uuid4().hex
    output_filename = f"report_{request_id}.pdf"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TEMP_DIR / output_filename

    try:
        config = Configuration(wkhtmltopdf=wkhtmltopdf)
        pdfkit.from_string(html_content, str(output_path), configuration=config)
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("wkhtmltopdf did not create a non-empty PDF.")
    except Exception as exc:
        _delete_file(output_path)
        raise HTTPException(status_code=500, detail="PDF generation failed.") from exc

    return FileResponse(
        str(output_path),
        filename=f"meeting_report_{request_id[:8]}.pdf",
        media_type="application/pdf",
        background=BackgroundTask(_delete_file, output_path),
    )

@router.get("/export_frames_zip")
def export_frames_zip(frame_set_id: str):
    _, frame_files = _resolve_frame_set(frame_set_id)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    export_id = uuid.uuid4().hex
    zip_output = TEMP_DIR / f"frames_{frame_set_id}_{export_id}.zip"

    try:
        with zipfile.ZipFile(zip_output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for frame_path in frame_files:
                archive.write(frame_path, arcname=frame_path.name)
    except Exception as exc:
        _delete_file(zip_output)
        raise HTTPException(status_code=500, detail="Frame export failed.") from exc

    return FileResponse(
        str(zip_output),
        filename=f"frames_{frame_set_id}.zip",
        media_type="application/zip",
        background=BackgroundTask(_delete_file, zip_output),
    )
