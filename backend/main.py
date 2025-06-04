from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from transcriber import transcribe_audio
#Summarizer
from summarizer import generate_summary
from pydantic import BaseModel
########################################


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

#Receive audio transcription
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    file_location = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_location, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    result = transcribe_audio(file_location)
    
    return {"text": result}


# Receive transcribed text and generate summary
class TranscriptText(BaseModel):
    text: str

@app.post("/summarize")
async def summarize(transcript: TranscriptText):
    summary = generate_summary(transcript.text)
    return {"summary": summary}
