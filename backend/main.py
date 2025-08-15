import os, sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import transcribe, analyze, report

# 确保当前文件夹在 sys.path
sys.path.append(os.path.dirname(__file__))

# 预创建 static 目录，避免 mount 时抛错
os.makedirs("static", exist_ok=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(transcribe.router)
app.include_router(analyze.router)
app.include_router(report.router)


# 挂载静态目录
app.mount("/static", StaticFiles(directory="static"), name="static")
