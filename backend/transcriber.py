from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")

def transcribe_audio(file_path: str) -> str:
    segments, _ = model.transcribe(file_path)
    result = ""
    for segment in segments:
        result += segment.text + " "
    return result.strip()
