from fastapi import APIRouter, UploadFile, File
import os
import shutil
import ffmpeg
from services.transcriber import transcribe_audio
from services.summarizer import generate_summary
from services.sentiment import analyze_sentiment
from services.deepfake import extract_frames, predict_image

router = APIRouter()

@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ext = file.filename.split(".")[-1].lower()

    # Audio Analysis
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

    # Video Analysis
    elif ext in ["mp4", "avi", "mov"]:
        # Step 1: Extract frames
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

        # Step 3: Audio analysis
        transcript = transcribe_audio(audio_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)

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
