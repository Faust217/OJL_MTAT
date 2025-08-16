from faster_whisper import WhisperModel

# Load Whisper once at import:
# - model size: "base"
# - CPU inference with int8 compute for portability
model = WhisperModel("base", device="cpu", compute_type="int8")

def transcribe_audio(file_path: str,lang=None):
    # Note: language is forced to "en" to keep current behavior.
    segments, _ = model.transcribe(file_path, language="en")
    transcript = []

    for segment in segments:
        transcript.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": segment.text.strip()
        })

    return transcript
