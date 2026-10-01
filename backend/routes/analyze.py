from fastapi import APIRouter, UploadFile, File
import shutil
import uuid
import ffmpeg
from datetime import datetime
from pathlib import Path

from runtime_paths import STATIC_FRAMES_DIR, TEMP_DIR
from services.transcriber import transcribe_audio
from services.summarizer import generate_summary
from services.sentiment import analyze_sentiment
from services.deepfake import extract_frames, predict_image

router = APIRouter()

@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    # 1) Persist this request's upload under a unique temp filename.
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    request_id = uuid.uuid4().hex
    original_suffix = Path(file.filename or "").suffix.lower()
    ext = original_suffix.lstrip(".")
    file_path = TEMP_DIR / f"upload_{request_id}{original_suffix}"
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # --- Audio flow ---
    if ext in ["mp3", "wav"]:
        try:
            transcript = transcribe_audio(str(file_path))
            summary = generate_summary(transcript)
            sentiment = analyze_sentiment(transcript)
            return {
                "type": "audio",
                "transcript": transcript,
                "summary": summary,
                "sentiment": sentiment
            }
        finally:
            file_path.unlink(missing_ok=True)

    # --- Video flow ---
    elif ext in ["mp4", "avi", "mov"]:
        # Keep frames as business output, but make each request's directory unique.
        frame_set_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}_{request_id}"
        frame_output_dir = STATIC_FRAMES_DIR / frame_set_id
        frame_output_dir.mkdir(parents=True, exist_ok=True)
        audio_path = TEMP_DIR / f"audio_{request_id}.wav"

        try:
            # Extract frames every 30s and run deepfake prediction.
            frames = extract_frames(file_path, frame_output_dir, interval_sec=30)
            frame_results = []
            fake_count = 0
            for frame_path in frames:
                label, score = predict_image(frame_path)
                if label == "Fake":
                    fake_count += 1
                fname = Path(frame_path).name
                frame_results.append({
                    "label": label,
                    "score": round(score * 100, 1),
                    "image_url": f"/static/frames/{frame_set_id}/{fname}"
                })

            # Extract audio -> mono wav 16k, preserving the existing error response.
            try:
                (
                    ffmpeg
                    .input(str(file_path))
                    .output(str(audio_path), ac=1, ar=16000)
                    .overwrite_output()
                    .run(quiet=True)
                )
            except Exception as e:
                return {"error": f"Failed to extract audio: {str(e)}"}

            # ASR + summary + sentiment on the extracted audio.
            transcript = transcribe_audio(str(audio_path))
            summary = generate_summary(transcript)
            sentiment = analyze_sentiment(transcript)

            return {
                "type": "video",
                "frame_set_id": frame_set_id,
                "frames_checked": len(frames),
                "fake_frames": fake_count,
                "frame_details": frame_results,
                "transcript": transcript,
                "summary": summary,
                "sentiment": sentiment
            }
        finally:
            audio_path.unlink(missing_ok=True)
            file_path.unlink(missing_ok=True)

    else:
        # --- Unsupported extension ---
        file_path.unlink(missing_ok=True)
        return {"error": "Unsupported file type."}


@router.post("/analyze_frame")
async def analyze_frame(file: UploadFile = File(...)):
    #     Single-frame deepfake check (used by RecordPage periodic snapshots).
    #     Returns: {"label": "...", "score": float_in_[0,1]}
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    filename = TEMP_DIR / f"frame_{uuid.uuid4().hex}.jpg"
    try:
        with filename.open("wb") as f:
            f.write(await file.read())
        label, score = predict_image(filename)
        return {"label": label, "score": score}
    finally:
        filename.unlink(missing_ok=True)
