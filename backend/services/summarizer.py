from transformers import BartTokenizer, BartForConditionalGeneration
import torch
import nltk
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

from nltk.tokenize import sent_tokenize
nltk.download('punkt')

model_name = "facebook/bart-large-cnn"
tokenizer = BartTokenizer.from_pretrained(model_name)
model = BartForConditionalGeneration.from_pretrained(model_name)

def seconds_to_timestamp(seconds):
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"

def split_transcript_into_chunks(transcript, max_tokens=900):
    chunks = []
    current_chunk = []
    current_text = ""
    current_start = None

    for segment in transcript:
        sentence = segment["text"]
        tokens = tokenizer.tokenize(sentence)
        if len(current_text) == 0:
            current_start = segment["start"]
        
        if len(tokenizer.tokenize(current_text)) + len(tokens) <= max_tokens:
            current_text += " " + sentence
            current_chunk.append(segment)
        else:
            chunks.append({
                "start": current_start,
                "end": current_chunk[-1]["end"],
                "text": current_text.strip()
            })
            current_chunk = [segment]
            current_text = sentence
            current_start = segment["start"]

    if current_chunk:
        chunks.append({
            "start": current_start,
            "end": current_chunk[-1]["end"],
            "text": current_text.strip()
        })

    return chunks

def generate_summary(transcript):
    chunks = split_transcript_into_chunks(transcript)
    summaries = []

    for idx, chunk in enumerate(chunks):
        inputs = tokenizer(chunk["text"], return_tensors="pt", truncation=True, max_length=1024)
        summary_ids = model.generate(
            inputs["input_ids"],
            num_beams=4,
            length_penalty=2.0,
            max_length=200,
            early_stopping=True
        )
        summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        start_time = seconds_to_timestamp(chunk["start"])
        end_time = seconds_to_timestamp(chunk["end"])
        summaries.append(f"🕒 {start_time} - {end_time}\n{summary}")

    return "\n\n".join(summaries)
