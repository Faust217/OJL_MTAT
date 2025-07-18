from fastapi import APIRouter, UploadFile, File
import os
import uuid
import time
import ffmpeg

from services.transcriber import transcribe_audio
from services.summarizer import generate_summary
from services.sentiment import analyze_sentiment

router = APIRouter()

@router.post("/transcribe_chunk")
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
        summary = ""
        sentiment = ""

    except Exception as e:
        transcript = [{
            "start": 0, "end": 0,
            "text": f"⚠️ Error: {str(e)}"
        }]
        summary = ""
        sentiment = ""

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
