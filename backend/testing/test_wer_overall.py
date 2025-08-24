import re
from pathlib import Path

def normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\[[^\]]+\]", " ", s)  
    s = re.sub(r"[^\w\s]", " ", s)      
    s = re.sub(r"\s+", " ", s).strip()
    return s

def wer(ref: str, hyp: str):
    r = ref.split()
    h = hyp.split()
    n, m = len(r), len(h)
    dp = [[0]*(m+1) for _ in range(n+1)]
    for i in range(1, n+1): dp[i][0] = i
    for j in range(1, m+1): dp[0][j] = j
    for i in range(1, n+1):
        ri = r[i-1]
        for j in range(1, m+1):
            cost = 0 if ri == h[j-1] else 1
            dp[i][j] = min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost)
    edits = dp[n][m]
    return edits / max(1, n), edits, n

HERE = Path(__file__).parent
hyp = (HERE / "hyp_transcript.txt").read_text(encoding="utf-8", errors="ignore")
ref = (HERE / "ref_transcript.txt").read_text(encoding="utf-8", errors="ignore")

h = normalize(hyp)
r = normalize(ref)
rate, edits, N = wer(r, h)
print(f"Overall WER: {rate*100:.2f}%  (edits={edits}, ref_words={N})")
