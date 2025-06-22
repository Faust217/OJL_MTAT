from transformers import pipeline

sentiment_pipeline = pipeline("sentiment-analysis")

def analyze_sentiment(text):
    max_len = 512
    chunks = [text[i:i+max_len] for i in range(0, len(text), max_len)]

    results = []
    for chunk in chunks:
        try:
            result = sentiment_pipeline(chunk)[0]
            results.append(result['label'])
        except:
            continue

    from collections import Counter
    count = Counter(results)
    return dict(count)
