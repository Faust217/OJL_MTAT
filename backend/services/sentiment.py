import nltk
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')


from transformers import AutoTokenizer, AutoModelForSequenceClassification
from scipy.special import softmax
from nltk.tokenize import sent_tokenize

import torch
from typing import List, Dict

# Load CardiffNLP RoBERTa model
model_name = "cardiffnlp/twitter-roberta-base-sentiment"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)
model.eval()

# Label mapping
labels = ['negative', 'neutral', 'positive']

def analyze_sentiment(transcript: List[Dict]) -> List[Dict]:
    """
    Analyze sentiment by each segment in the transcript.
    Input: transcript = [{"start": float, "end": float, "text": str}, ...]
    Output: [{"start": str, "end": str, "sentiment": str, "score": float}, ...]
    """
    results = []
    
    for segment in transcript:
        text = segment["text"]
        encoded_input = tokenizer(text, return_tensors='pt', truncation=True)
        with torch.no_grad():
            output = model(**encoded_input)
            scores = output.logits[0].numpy()
            scores = softmax(scores)
            sentiment_id = scores.argmax()
            sentiment_label = labels[sentiment_id]
            sentiment_score = float(scores[sentiment_id])

        results.append({
            "start": segment["start"],
            "end": segment["end"],
            "sentiment": sentiment_label,
            "score": round(sentiment_score, 4)
        })

    return results
