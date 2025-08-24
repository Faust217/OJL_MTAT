from rouge_score import rouge_scorer

with open("testing/ref_summarize.txt", "r", encoding="utf-8") as f:
    ref = f.read()

with open("testing/hyp_summarize.txt", "r", encoding="utf-8") as f:
    hyp = f.read()

scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)
scores = scorer.score(ref, hyp)

for metric, result in scores.items():
    print(f"{metric.upper()}:")
    print(f"  Precision: {result.precision:.4f}")
    print(f"  Recall:    {result.recall:.4f}")
    print(f"  F1 Score:  {result.fmeasure:.4f}")
