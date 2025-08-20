import os, re
from typing import List, Dict, Any

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM


# ---- Model knobs ----
MODEL_NAME = os.getenv("BART_MODEL_NAME", "philschmid/bart-large-cnn-samsum")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
TOKENIZER = AutoTokenizer.from_pretrained(MODEL_NAME)
MODEL = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(DEVICE).eval()

NUM_BEAMS = int(os.getenv("BART_NUM_BEAMS", "4"))      # 2 = faster, 4 = better
MIN_LEN   = int(os.getenv("BART_MIN_LENGTH", "120"))
MAX_LEN   = int(os.getenv("BART_MAX_LENGTH", "220"))
MAX_SRC   = int(os.getenv("BART_MAX_SOURCE_TOKENS", "900"))

# Toggle lightweight struct sections (regex only)
ENABLE_STRUCT = os.getenv("ENABLE_STRUCT", "1") == "1"


# ---- Text utils ----
def _sent_split(text: str) -> List[str]:
    try:
        from nltk.tokenize import sent_tokenize
        return [s.strip() for s in sent_tokenize(text) if s.strip()]
    except Exception:
        return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]

def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()

def _transcript_to_text(transcript: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for seg in transcript or []:
        t = str(seg.get("text", "")).strip()
        if t:
            parts.append(t)
    return " ".join(parts)

def _chunk_by_tokens(text: str, max_src_len: int = MAX_SRC) -> List[str]:
    if not text.strip():
        return []
    words = text.split()
    chunks: List[str] = []
    buf: List[str] = []
    for w in words:
        buf.append(w)
        if len(TOKENIZER(" ".join(buf), add_special_tokens=False)["input_ids"]) > max_src_len:
            buf.pop()
            chunks.append(" ".join(buf))
            buf = [w]
    if buf:
        chunks.append(" ".join(buf))
    return chunks

@torch.no_grad()
def _summarize_once(text: str) -> str:
    enc = TOKENIZER(text, max_length=1024, truncation=True, return_tensors="pt").to(DEVICE)
    out = MODEL.generate(
        **enc,
        do_sample=False,
        num_beams=NUM_BEAMS,
        no_repeat_ngram_size=3,
        length_penalty=1.0,
        min_length=MIN_LEN,
        max_length=MAX_LEN,
        early_stopping=True,
    )
    return TOKENIZER.decode(out[0], skip_special_tokens=True)

def _pick_bullets(paragraph: str, k: int = 6) -> List[str]:
    sents = [_clean(s) for s in _sent_split(paragraph)]
    sents = [s for s in sents if len(s.split()) >= 6]
    action_kw   = re.compile(r"\b(update|deliver|send|prepare|review|finalize|test|fix|implement|schedule|align|confirm|approve|assign|follow[- ]?up|work on)\b", re.I)
    decision_kw = re.compile(r"\b(decide|decided|agreement|agreed|approved|finalize|choose|switch|adopt)\b", re.I)
    number_kw   = re.compile(r"\b\d[\d,]*(?:\.\d+)?%?\b|\b(RM|MYR|USD|EUR)\s?\d|\b€\s?\d|\$\s?\d", re.I)
    def score(s: str) -> float:
        sc = 0.0
        if action_kw.search(s): sc += 1.2
        if decision_kw.search(s): sc += 1.0
        if number_kw.search(s):   sc += 0.7
        n = len(s.split())
        if 10 <= n <= 28: sc += 0.5
        return sc
    uniq = list(dict.fromkeys(sents))
    ranked = sorted(uniq, key=lambda x: (-score(x), -len(x)))
    return ranked[:k]

# ---- Ultra-light struct extraction (regex only) ----
FILLER_PREFIX = re.compile(r"^(?:\s*(?:um|uh|er|ah|so|well|and)[,.\s])+ ?", re.I)
Q_PAT         = re.compile(r"\?\s*$")
PLEASANTRY    = re.compile(r"\b(thank you|thanks|great|awesome|nice)\b", re.I)

AGENT_RE  = re.compile(
    r"\b(we|you|team|designer|engineer|developer|pm|manager|marketing|qa|ops|student|presenter|industrial designer|marketing executive)\b",
    re.I,
)
ACTION_RE = re.compile(
    r"\b(will|need to|should|plan to|try to|please|assign|prepare|send|email|review|update|implement|fix|deploy|test|analyze|summarize|document|schedule|share|collect|gather|design|draft|work on)\b",
    re.I,
)
DECIDE_RE = re.compile(r"\b(decide|decided|agree|agreed|finalize|approve|approved|choose|adopt|conclude|concluded)\b", re.I)

def _norm_task_text(s: str) -> str:
    s = FILLER_PREFIX.sub("", s or "").strip()
    s = re.sub(r"\b(as the|for the)\s+([a-z ]+?),\s*", lambda m: m.group(2).title() + " — ", s, flags=re.I)
    s = re.sub(r"\b(you|we)\s+(are\s+going\s+to|going\s+to|will|should|need\s+to)\s+", "", s, flags=re.I)
    s = re.sub(r"\bto\s+be\s+working\s+on\b", "work on", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()

def _extract_actions_decisions(raw_text: str, cap_act: int = 6, cap_dec: int = 4):
    actions: List[str] = []
    decisions: List[str] = []
    for s in _sent_split(raw_text):
        s = _clean(s)
        if not s or PLEASANTRY.search(s) or Q_PAT.search(s):
            continue
        if DECIDE_RE.search(s):
            decisions.append(s)
            continue
        if AGENT_RE.search(s) and ACTION_RE.search(s):
            actions.append(_norm_task_text(s))
    # de-dup keep order
    def dedupe(xs: List[str]) -> List[str]:
        seen = set(); out = []
        for x in xs:
            k = x.lower()
            if k not in seen:
                seen.add(k); out.append(x)
        return out
    return dedupe(actions)[:cap_act], dedupe(decisions)[:cap_dec]

def _extract_key_facts(raw_text: str, cap: int = 8) -> List[str]:
    out: List[str] = []
    cur = re.findall(r"(?:€|\$|RM|MYR|USD|EUR)\s?\d[\d,]*(?:\.\d+)?", raw_text, flags=re.I)
    pct = re.findall(r"\b\d+(?:\.\d+)?\s*%", raw_text)
    dur = re.findall(r"\b\d+\s*(?:seconds?|minutes?|hours?|hrs?|days?)\b", raw_text, flags=re.I)
    tme = re.findall(r"\b([01]?\d|2[0-3]):[0-5]\d\b", raw_text)
    dte = re.findall(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", raw_text)
    for bucket in (cur, pct, dur, tme, dte): out.extend(bucket)
    def _norm(x: str) -> str:
        y = re.sub(r"\s+", " ", x).strip()
        y = re.sub(r"(\d),(?=\d{3}\b)", r"\1", y)
        y = re.sub(r"\b(MYR|USD|EUR|RM)\s+", r"\1 ", y, flags=re.I)
        y = re.sub(r"€\s+", "€", y); y = re.sub(r"\$\s+", "$", y)
        return y
    seen = set(); facts: List[str] = []
    for v in out:
        n = _norm(v); k = n.lower()
        if k not in seen:
            seen.add(k); facts.append(n)
        if len(facts) >= cap: break
    return facts


# ---- Public API ----
def generate_summary(transcript: List[Dict[str, Any]]) -> str:
    full_text = _clean(_transcript_to_text(transcript))
    if not full_text:
        return "Executive Summary:\n• No transcript content available."

    # chunk + 1st pass
    parts = _chunk_by_tokens(full_text, max_src_len=MAX_SRC) or [full_text]
    partials = [_summarize_once(p) for p in parts]
    merged = " ".join(partials)
    # optional 2nd pass for coherence
    final_paragraph = _summarize_once(merged) if len(partials) > 1 else partials[0]

    bullets = _pick_bullets(final_paragraph, k=6)

    lines: List[str] = []
    lines.append("Executive Summary:")
    lines.append(final_paragraph.strip())

    if bullets:
        lines.append("")
        lines.append("Key Takeaways:")
        for b in bullets:
            lines.append(f"• {b}")

    if ENABLE_STRUCT:
        actions, decisions = _extract_actions_decisions(full_text)
        facts = _extract_key_facts(full_text, cap=8)

        if facts:
            lines.append("")
            lines.append("Key Facts:")
            for f in facts:
                lines.append(f"• {f}")

    return "\n".join(lines).strip()
