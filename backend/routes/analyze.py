from fastapi import APIRouter, UploadFile, File
import os
import shutil
import uuid
import ffmpeg
from datetime import datetime

from services.transcriber import transcribe_audio
from services.summarizer import generate_summary
from services.sentiment import analyze_sentiment
from services.deepfake import extract_frames, predict_image

router = APIRouter()

@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    # # 1) Persist upload to temp/
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ext = file.filename.rsplit(".", 1)[-1].lower()

    # --- Audio flow ---
    if ext in ["mp3", "wav"]:
        transcript = transcribe_audio(file_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)
        # cleanup
        os.remove(file_path)
        return {
            "type": "audio",
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    # --- Video flow ---
    elif ext in ["mp4", "avi", "mov"]:
        # Prepare static frames output directory by timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        frame_output_dir = os.path.join("static", "frames", timestamp)
        os.makedirs(frame_output_dir, exist_ok=True)

        # Extract frames every 30s and run deepfake prediction
        frames = extract_frames(file_path, frame_output_dir, interval_sec=30)
        frame_results = []
        fake_count = 0
        for frame_path in frames:
            label, score = predict_image(frame_path)
            if label == "Fake":
                fake_count += 1
            fname = os.path.basename(frame_path)
            frame_results.append({
                "label": label,
                "score": round(score * 100, 1),
                "image_url": f"/static/frames/{timestamp}/{fname}"
            })

        # Extract audio -> mono wav 16k
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

        # ASR + summary + sentiment on the extracted audio
        transcript = transcribe_audio(audio_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)

        # Cleanup temp files
        for p in [audio_path, file_path]:
            if os.path.exists(p):
                os.remove(p)

        return {
            "type": "video",
            "frames_checked": len(frames),
            "fake_frames": fake_count,
            "frame_details": frame_results,     
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    else:
        # --- Unsupported extension ---
        os.remove(file_path)
        return {"error": "Unsupported file type."}


@router.post("/analyze_frame")
async def analyze_frame(file: UploadFile = File(...)):
    #     Single-frame deepfake check (used by RecordPage periodic snapshots).
    #     Returns: {"label": "...", "score": float_in_[0,1]}
    filename = f"temp/frame_{uuid.uuid4().hex}.jpg"
    with open(filename, "wb") as f:
        f.write(await file.read())
    label, score = predict_image(filename)
    os.remove(filename)
    return {"label": label, "score": score}
