from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")

def transcribe_audio(file_path: str,lang=None):
    segments, _ = model.transcribe(file_path, language=lang)
    transcript = []

    for segment in segments:
        transcript.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": segment.text.strip()
        })

    return transcript
