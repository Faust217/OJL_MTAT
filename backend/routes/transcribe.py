from fastapi import APIRouter, UploadFile, File
import os
import uuid
import time
import ffmpeg

from runtime_paths import TEMP_DIR
from services.transcriber import transcribe_audio
from services.summarizer import generate_summary
from services.sentiment import analyze_sentiment

router = APIRouter()

@router.post("/transcribe_chunk")
async def transcribe_chunk(file: UploadFile = File(...)):
    '''
    Receive a single full recording (webm), convert to wav (mono/16k),
    then run ASR + summarization + sentiment analysis.

    Behavior intentionally preserved:
    - Early return for very small/invalid chunks still returns a *list* of transcript items
      (not a dict). This matches your original behavior and keeps the frontend contract unchanged.
    - Error branches still set `summary`/`sentiment` to empty string as in your code.

    Pipeline:
      1) Read the uploaded bytes
      2) Persist raw .webm into temp/
      3) Convert to .wav via ffmpeg (mono @ 16k)
      4) Run transcribe → summarize → sentiment
      5) Cleanup temp files
    '''

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = TEMP_DIR / f"chunk_{uuid.uuid4().hex}.webm"
    wav_path = raw_path.with_suffix(".wav")

    # Read all bytes of the uploaded chunk
    content = await file.read()
    print("🧾 Chunk size:", len(content), "bytes")

     # Small/invalid chunk guard — original early return shape is preserved
    if len(content) < 2048:
        return [{"start": 0, "end": 0, "text": "⚠️ Skipped empty or invalid chunk."}]

    with raw_path.open("wb") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())

     # Allow filesystem to settle a bit
    time.sleep(0.2)

    try:
          # Convert webm → wav (mono/16k), keeping original ffmpeg flags
        (
            ffmpeg
            .input(str(raw_path), f='webm', analyzeduration='2147483647', probesize='2147483647')
            .output(str(wav_path), format='wav', acodec='pcm_s16le', ac=1, ar=16000)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )

        # Run ASR + summarization + sentiment
        transcript = transcribe_audio(str(wav_path), lang="en")
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
        # Cleanup temp file
        raw_path.unlink(missing_ok=True)
        wav_path.unlink(missing_ok=True)

    # Final response shape
    return {
        "transcript": transcript,
        "summary": summary,
        "sentiment": sentiment
    }
