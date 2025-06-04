from transformers import PegasusTokenizer, PegasusForConditionalGeneration

model_name = "google/pegasus-xsum"
tokenizer = PegasusTokenizer.from_pretrained(model_name)
model = PegasusForConditionalGeneration.from_pretrained(model_name)

def generate_summary(text: str) -> str:
    tokens = tokenizer(text, truncation=True, padding="longest", return_tensors="pt")

    summary_ids = model.generate(**tokens, max_length=200)

    summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
    return summary
