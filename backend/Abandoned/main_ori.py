from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from transcriber import transcribe_audio
from summarizer import generate_summary
from sentiment_analyzer import analyze_sentiment
from frame_extractor import extract_frames
from deepfake_detector import predict_image
import shutil
import os
import tempfile
import ffmpeg
import uuid
import time 
import subprocess


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/transcribe_chunk")
async def transcribe_chunk(file: UploadFile = File(...)):
    raw_path = f"temp/chunk_{uuid.uuid4().hex}.webm"
    wav_path = raw_path.replace(".webm", ".wav")

    content = await file.read()
    print("🧾 Chunk size:", len(content), "bytes")

    if len(content) < 2048:
        return [{"start": 0, "end": 0, "text": "⚠️ Skipped empty or invalid chunk."}]

    with open(raw_path, "wb") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())

    time.sleep(0.2)

    try:
        (
            ffmpeg
            .input(raw_path, f='webm', analyzeduration='2147483647', probesize='2147483647')
            .output(wav_path, format='wav', acodec='pcm_s16le', ac=1, ar=16000)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )

        transcript = transcribe_audio(wav_path, lang="en")
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)


    except ffmpeg.Error as e:
        print("🔥 ffmpeg error detail:", e.stderr.decode())
        transcript = [{
            "start": 0, "end": 0,
            "text": f"⚠️ ffmpeg error: {e.stderr.decode().strip().splitlines()[-1]}"
        }]

    except Exception as e:
        transcript = [{
            "start": 0, "end": 0,
            "text": f"⚠️ Error: {str(e)}"
        }]

    finally:
        if os.path.exists(raw_path):
            os.remove(raw_path)
        if os.path.exists(wav_path):
            os.remove(wav_path)

    return {
    "transcript": transcript,
    "summary": summary,
    "sentiment": sentiment
    }


@app.post("/record")
async def analyze_recorded_audio(file: UploadFile = File(...)):
    temp_path = f"temp/{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())

    mp3_path = temp_path.replace(".webm", ".mp3")
    ffmpeg.input(temp_path).output(mp3_path).run(overwrite_output=True)

    transcript = transcribe_audio(mp3_path)
    summary = generate_summary(transcript)
    sentiment = analyze_sentiment(transcript)

    os.remove(temp_path)
    os.remove(mp3_path)

    return {
        "type": "audio",
        "transcript": transcript,
        "summary": summary,
        "sentiment": sentiment
    }


@app.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ext = file.filename.split(".")[-1].lower()

    if ext in ["mp3", "wav"]:
        transcript = transcribe_audio(file_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)
        return {
            "type": "audio",
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    elif ext in ["mp4", "avi", "mov"]:
        # Step 1: Extract frames (every 30 seconds)
        frames = extract_frames(file_path, temp_dir, interval_sec=30)
        fake_count = 0
        for frame_path in frames:
            label, score = predict_image(frame_path)
            if label == "Fake":
                fake_count += 1
            os.remove(frame_path)

        # Step 2: Extract audio
        audio_path = os.path.join(temp_dir, "audio.wav")
        try:
            (
                ffmpeg
                .input(file_path)
                .output(audio_path, ac=1, ar=16000)
                .overwrite_output()
                .run(quiet=True)
            )
        except Exception as e:
            return {"error": f"Failed to extract audio: {str(e)}"}

        # Step 3: Analyze audio
        transcript = transcribe_audio(audio_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)

        # Step 4: Clean up
        if os.path.exists(audio_path):
            os.remove(audio_path)
        if os.path.exists(file_path):
            os.remove(file_path)

        return {
            "type": "video",
            "frames_checked": len(frames),
            "fake_frames": fake_count,
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    else:
        return {"error": "Unsupported file type."}



