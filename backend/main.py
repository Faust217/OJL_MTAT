import os, sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import transcribe, analyze, report

# Ensure current folder is in sys.path for relative imports
sys.path.append(os.path.dirname(__file__))

# Pre-create static/ to avoid mount errors if the folder does not exist
os.makedirs("static", exist_ok=True)

app = FastAPI()

# CORS: allow local dev frontends and future deployments to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this for production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(transcribe.router)
app.include_router(analyze.router)
app.include_router(report.router)

# Serve static files (extracted frames etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")
