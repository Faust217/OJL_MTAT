from transformers import pipeline
from datasets import load_dataset
import pandas as pd
from sklearn.metrics import classification_report

ds = load_dataset("cardiffnlp/tweet_eval", "sentiment")
df = pd.DataFrame(ds["test"])
df = df[["text", "label"]].copy()
df["label"] = df["label"].map({0: "negative", 1: "neutral", 2: "positive"})

df = df.sample(500, random_state=42).reset_index(drop=True)

classifier = pipeline("sentiment-analysis", model="cardiffnlp/twitter-roberta-base-sentiment", top_k=None)

label_map = {"LABEL_0": "negative", "LABEL_1": "neutral", "LABEL_2": "positive"}

predicted_labels = []

print("PROCESSING SENTIMENT ANALYSIS...")

for i, text in enumerate(df["text"]):
    try:
        result = classifier(text)[0]
        label = label_map.get(max(result, key=lambda x: x["score"])["label"], "neutral")
        predicted_labels.append(label)
    except Exception as e:
        print(f"[PASS THE {i} SENTENCE FAILED: {e}")
        predicted_labels.append("neutral")  # fallback

df["predicted"] = predicted_labels

print("\n📊 Classification Report:")
print(classification_report(df["label"], df["predicted"], digits=4))
