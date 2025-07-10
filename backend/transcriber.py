from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")

def transcribe_audio(file_path: str):
    segments, _ = model.transcribe(file_path)
    transcript = []

    for segment in segments:
        transcript.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": segment.text.strip()
        })

    return transcript
