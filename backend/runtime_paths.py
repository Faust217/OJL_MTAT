from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parent

MODEL_DIR = BACKEND_ROOT / "model"
TEMPLATES_DIR = BACKEND_ROOT / "templates"
UPLOADS_DIR = BACKEND_ROOT / "uploads"

TEMP_DIR = BACKEND_ROOT / "temp"
STATIC_DIR = BACKEND_ROOT / "static"
STATIC_FRAMES_DIR = STATIC_DIR / "frames"
EXTRACTED_FRAMES_DIR = BACKEND_ROOT / "extracted_frames"


def ensure_runtime_directories() -> None:
    """Create writable directories required by the running application."""
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_FRAMES_DIR.mkdir(parents=True, exist_ok=True)
