from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil
import os
import uuid
from transcriber import transcribe_audio
from summarizer import generate_summary
from sentiment_analyzer import analyze_sentiment
from deepfake_detector import predict_image
from frame_extractor import extract_frames
from pydantic import BaseModel
from typing import List, Dict

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ========== Audio-Only Modules ==========

@app.post("/transcribe")
def transcribe(file: UploadFile = File(...)):
    with open(file.filename, "wb") as f:
        f.write(file.file.read())
    transcript = transcribe_audio(file.filename)
    return {"transcript": transcript}

class TranscriptChunk(BaseModel):
    start: float
    end: float
    text: str

class TranscriptRequest(BaseModel):
    transcript: List[TranscriptChunk]

@app.post("/summarize")
def summarize(transcript: TranscriptRequest):
    transcript_list = [chunk.dict() for chunk in transcript.transcript]
    summary = generate_summary(transcript_list)
    return {"summary": summary}

class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str

@app.post("/sentiment")
async def get_sentiment(transcript: List[TranscriptSegment]):
    result = analyze_sentiment([seg.dict() for seg in transcript])
    return {"result": result}

# ========== Deepfake Detection ==========

@app.post("/detect")
async def detect_deepfake(file: UploadFile = File(...)):
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)

    with open(file_path, "wb") as f:
        f.write(await file.read())

    label, score = predict_image(file_path)

    if os.path.exists(file_path):
        os.remove(file_path)

    return {
        "prediction_label": label,
        "prediction_score": score
    }

# ========== Unified Analyze Endpoint ==========

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)

    ext = file.filename.split(".")[-1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(temp_dir, filename)

    with open(file_path, "wb") as f:
        f.write(await file.read())

    if ext in ["mp3", "wav", "m4a"]:
        transcript = transcribe_audio(file_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)
        os.remove(file_path)
        return {
            "type": "audio",
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    elif ext in ["mp4", "avi", "mov"]:
        frame_dir = os.path.join(temp_dir, f"frames_{uuid.uuid4().hex}")
        os.makedirs(frame_dir, exist_ok=True)

        extract_frames(file_path, output_folder=frame_dir, interval=30)
        frame_files = sorted([os.path.join(frame_dir, f) for f in os.listdir(frame_dir) if f.endswith(".jpg")])

        results = [predict_image(f) for f in frame_files]
        fake_count = sum(1 for r in results if r[0] == "Fake")

        for f in frame_files:
            os.remove(f)
        os.rmdir(frame_dir)
        os.remove(file_path)

        return {
            "type": "video",
            "frames_checked": len(results),
            "fake_frames": fake_count
        }

    else:
        os.remove(file_path)
        return JSONResponse(
            status_code=400,
            content={"message": "❌ Unsupported file type. Please upload audio or video."}
        )
