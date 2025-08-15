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
    request_data = await request.json()

    env = Environment(loader=FileSystemLoader("templates"))
    template = env.get_template("report_template.html")
    html_content = template.render(data=request_data)

    output_filename = f"report_{uuid.uuid4().hex[:8]}.pdf"
    output_path = f"temp/{output_filename}"

    
    config = Configuration(wkhtmltopdf=r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe")
    pdfkit.from_string(html_content, output_path, configuration=config)

    return FileResponse(output_path, filename="meeting_report.pdf", media_type='application/pdf')

@router.get("/export_frames_zip")
def export_frames_zip():
    # ⚠️ 指定截图文件夹路径（记得替换为你实际的路径变量或时间戳）
    frames_folder = "static/frames/20250812_164852"  # ❗替换为动态值也行
    zip_output = "temp/deepfake_frames.zip"

    # 若已有旧 zip，先删除
    if os.path.exists(zip_output):
        os.remove(zip_output)

    # 创建 zip 文件
    shutil.make_archive(zip_output.replace(".zip", ""), 'zip', frames_folder)

    return FileResponse(
        zip_output,
        filename="deepfake_frames.zip",
        media_type="application/zip"
    )
