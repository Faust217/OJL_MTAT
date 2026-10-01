from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
import pdfkit
import shutil
from jinja2 import Environment, FileSystemLoader
import uuid
from pdfkit.configuration import Configuration

from runtime_paths import STATIC_FRAMES_DIR, TEMP_DIR, TEMPLATES_DIR

router = APIRouter()

@router.post("/generate_pdf")
async def generate_pdf(request: Request):
    # Read JSON payload from frontend
    request_data = await request.json()

    # Load the template from the backend resource directory.
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    template = env.get_template("report_template.html")
    html_content = template.render(data=request_data)

    # Compose a unique output filename under temp/
    output_filename = f"report_{uuid.uuid4().hex[:8]}.pdf"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TEMP_DIR / output_filename

    
    config = Configuration(wkhtmltopdf=r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe")
    pdfkit.from_string(html_content, str(output_path), configuration=config)

    return FileResponse(str(output_path), filename="meeting_report.pdf", media_type='application/pdf')

@router.get("/export_frames_zip")
def export_frames_zip():
    frames_folder = STATIC_FRAMES_DIR / "20250812_164852"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    zip_output = TEMP_DIR / "deepfake_frames.zip"

    if zip_output.exists():
        zip_output.unlink()

    shutil.make_archive(str(zip_output.with_suffix("")), 'zip', str(frames_folder))

    return FileResponse(
        str(zip_output),
        filename="deepfake_frames.zip",
        media_type="application/zip"
    )
