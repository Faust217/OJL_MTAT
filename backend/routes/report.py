from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
import pdfkit
import shutil
from jinja2 import Environment, FileSystemLoader
import uuid
import os
from pdfkit.configuration import Configuration

router = APIRouter()

@router.post("/generate_pdf")
async def generate_pdf(request: Request):
    # Read JSON payload from frontend
    request_data = await request.json()

    # Load Jinja2 template from ./templates/report_template.html
    env = Environment(loader=FileSystemLoader("templates"))
    template = env.get_template("report_template.html")
    html_content = template.render(data=request_data)

    # Compose a unique output filename under temp/
    output_filename = f"report_{uuid.uuid4().hex[:8]}.pdf"
    output_path = f"temp/{output_filename}"

    
    config = Configuration(wkhtmltopdf=r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe")
    pdfkit.from_string(html_content, output_path, configuration=config)

    return FileResponse(output_path, filename="meeting_report.pdf", media_type='application/pdf')

@router.get("/export_frames_zip")
def export_frames_zip():
    frames_folder = "static/frames/20250812_164852"  
    zip_output = "temp/deepfake_frames.zip"

    if os.path.exists(zip_output):
        os.remove(zip_output)

    shutil.make_archive(zip_output.replace(".zip", ""), 'zip', frames_folder)

    return FileResponse(
        zip_output,
        filename="deepfake_frames.zip",
        media_type="application/zip"
    )
