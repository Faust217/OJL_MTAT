import re
from collections import Counter

# -------------------- Sentence split (NLTK optional) --------------------

def _ensure_sentence_tokenize():
    """
    Use NLTK sent_tokenize if available; otherwise fall back to a regex-based splitter.
    This keeps the API robust even when NLTK 'punkt' is not installed.
    """
    try:
        from nltk.tokenize import sent_tokenize  # type: ignore
        _ = sent_tokenize("Test. One. Two.")     # force resource check
        return sent_tokenize
    except Exception:
        dot_re = re.compile(r"(?<!\b[A-Z])[.!?]+\s+")
        def _splitter(text: str):
            parts = dot_re.split((text or "").strip())
            return [p.strip() for p in parts if p.strip()]
        return _splitter

SENT_SPLIT = _ensure_sentence_tokenize()

# -------------------- Regex: noise & guards --------------------

# Low-information fillers
FILLER_ONLY = re.compile(r"^\W*([uh]+|um+|er+|ah+|mm+)\W*$", re.IGNORECASE)
URL_PAT     = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
BAD_RE      = re.compile(r"(subscribe|like and share|follow us|click the link)", re.IGNORECASE)

# Promo/award hallucinations to drop early
PROMO_RE = re.compile(
    r"\b(winner|winners|prize|award|awards|giveaway|raffle|"
    r"subscribe|subscription|follow us|twitter|facebook|instagram|"
    r"visit our (site|website)|order your copy)\b",
    re.IGNORECASE
)

# Polite/pleasantry lines that carry no meeting content
PLEASANTRY_RE = re.compile(
    r"\b(thank you|thanks|good job|well done|very good of you|nice|great|awesome)\b",
    re.IGNORECASE
)

# Low-value onboarding/ice-breaker questions
LOW_VALUE_Q_RE = re.compile(
    r"(introduce yourself|who would like to go first|can you hear me|am i audible)",
    re.IGNORECASE
)

# End-of-meeting / uncertainty (to filter)
ENDING_RE = re.compile(r"\b(end of the meeting|wrap up)\b", re.IGNORECASE)
IDK_RE    = re.compile(r"\bi (don['’]?t|do not) know\b", re.IGNORECASE)

# Keep only business-relevant open questions
Q_KEEP_RE = re.compile(
    r"\b(cost|price|budget|timeline|deadline|scope|requirement|design|function|"
    r"feature|market|region|compatib|wholesale|retail)\b",
    re.IGNORECASE
)

# Questions / risks / decisions
Q_PAT      = re.compile(r"\?\s*$")
ISSUE_PAT  = re.compile(r"\b(risk|issue|delay|blocker|concern|problem|bug|fail|failure|cannot|can't)\b", re.IGNORECASE)
DECIDE_PAT = re.compile(r"\b(decide|decision|agree|finalize|approve)\b", re.IGNORECASE)

# Agent + action (Action Items require both)
AGENT_RE  = re.compile(
    r"\b(we|you|team|designer|engineer|developer|pm|manager|marketing|"
    r"research|qa|ops|supervisor|student|presenter|ui|ux|industrial designer|marketing executive)\b",
    re.IGNORECASE
)
ACTION_RE = re.compile(
    r"\b(will|need to|should|plan to|try to|please|assign|prepare|send|email|"
    r"review|update|implement|fix|deploy|test|analyze|summarize|document|"
    r"schedule|share|collect|gather|design|draft|work on|build)\b",
    re.IGNORECASE
)

# Scheduling chatter (penalize in scoring)
SCHED_RE = re.compile(
    r"\b(next meeting|in \d+\s*minutes|over the next \d+\s*minutes|by my watch)\b",
    re.IGNORECASE
)

# -------------------- Number awareness --------------------

# Generic numbers (used for a small bonus only)
NUM_RE  = re.compile(r"\b\d[\d,]*(?:\.\d+)?\b")

# Strong numeric signals
PCT_RE  = re.compile(r"\b\d+(?:\.\d+)?\s*%\b")
CUR_RE  = re.compile(
    r"(?:€|\$|RM|MYR|USD|EUR)\s?\d[\d,]*(?:\.\d+)?"
    r"|\b\d[\d,]*(?:\.\d+)?\s*(?:euro|eur|usd|myr|rm)\b",
    re.IGNORECASE
)
DUR_RE  = re.compile(r"\b(\d+)\s*(seconds?|minutes?|hours?|hrs?|days?)\b", re.IGNORECASE)
TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):[0-5]\d\b")  # HH:MM
DATE_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b")  # dd/mm(/yyyy)

# -------------------- Tokenization helpers --------------------

WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-']+")

STOPWORDS = set((
    "the","a","an","and","or","but","if","so","to","of","in","on","for","at","by",
    "with","is","are","was","were","be","been","being","that","this","it","as",
    "from","we","you","they","he","she","i","our","your","their","not","do","did",
    "does","have","has","had","will","would","can","could","should","may","might",
    "about","into","over","than","then","there","here","very","just","also"
))

def _tokens(text: str):
    return [t.lower() for t in WORD_RE.findall(text or "")]

def _ngrams(tokens, n=2):
    return list(zip(*[tokens[i:] for i in range(n)]))

def _jaccard(a_set, b_set):
    inter = len(a_set & b_set)
    return 0.0 if inter == 0 else inter / (len(a_set | b_set) or 1)

# -------------------- Low-info & cleanup heuristics --------------------

def _too_punctuated(s: str) -> bool:
    p = sum(ch in ",.;:!?-–—" for ch in s)
    return p > max(6, len(s) * 0.20)

def _high_stopword_ratio(s: str) -> bool:
    toks = WORD_RE.findall(s.lower())
    if not toks:
        return True
    sw = sum(1 for t in toks if t in STOPWORDS)
    return (sw / max(1, len(toks))) > 0.60

def _looks_noisy_asr(s: str) -> bool:
    # Very short + many commas
    if len(s.split()) < 4 and s.count(",") >= 2:
        return True
    # Repeated interjections
    if re.search(r"\b(uh|um|er|ah)\b(?:\s*,?){0,2}\b(uh|um|er|ah)\b", s, re.I):
        return True
    return False

def _is_low_info(s: str) -> bool:
    return (
        FILLER_ONLY.match(s)
        or len(s.split()) < 7
        or BAD_RE.search(s)
        or URL_PAT.search(s)
        or PROMO_RE.search(s)
        or PLEASANTRY_RE.search(s)
        or LOW_VALUE_Q_RE.search(s)
        or _too_punctuated(s)
        or _high_stopword_ratio(s)
        or _looks_noisy_asr(s)
        or ENDING_RE.search(s)       # drop closing lines like "that's the end of the meeting"
        or IDK_RE.search(s)          # drop uncertain "I don't know …" lines
    )

FILLER_PREFIX_RE = re.compile(r"^(?:\s*(?:um|uh|er|ah|so|well|and)[,.\s])+ ?", re.IGNORECASE)

def _cleanup_line(s: str) -> str:
    """Trim leading fillers and do light currency normalization."""
    s = FILLER_PREFIX_RE.sub("", s or "").strip()
    # Light currency normalization like "12, 50 euro" -> "€12.50"
    s = re.sub(r"\b(\d{1,3})[,\s](\d{2})\s*(euro|eur)\b", r"€\1.\2", s, flags=re.IGNORECASE)
    s = re.sub(r"\s{2,}", " ", s)
    return s

# -------------------- Numeric extraction --------------------

def _collect_numeric_spans(s: str):
    """
    Extract numeric facts for the 'Numbers Mentioned' section.
    Keep only meaningful units: currency, percentages, durations, times, dates.
    """
    found = []

    for m in CUR_RE.finditer(s):
        found.append(m.group(0).strip())

    for m in PCT_RE.finditer(s):
        found.append(m.group(0).strip())

    for m in DUR_RE.finditer(s):
        found.append(m.group(0).strip())

    for m in TIME_RE.finditer(s):
        found.append(m.group(0).strip())

    for m in DATE_RE.finditer(s):
        found.append(m.group(0).strip())

    # Normalize spaces and dedupe while preserving order
    cleaned = []
    for f in found:
        f2 = re.sub(r"\s+", " ", f).strip()
        cleaned.append(f2)

    seen = set()
    out = []
    for x in cleaned:
        low = x.lower()
        if low not in seen:
            seen.add(low)
            out.append(x)
    return out

def _number_score(s: str) -> float:
    """Return a bonus score based on presence/quality of numeric content."""
    score = 0.0
    if CUR_RE.search(s):   score += 0.45
    if PCT_RE.search(s):   score += 0.35
    if DUR_RE.search(s):   score += 0.25
    if TIME_RE.search(s) or DATE_RE.search(s): score += 0.20
    if NUM_RE.search(s):   score += 0.10  # generic numbers: small bonus only
    return min(score, 0.90)

# -------------------- Scoring & selection --------------------

def _salience_by_tf(sentences):
    """Compute unigram/bigram salience from the whole meeting."""
    uni = Counter()
    bi  = Counter()
    for s in sentences:
        toks = [t for t in _tokens(s) if t not in STOPWORDS]
        uni.update(toks)
        bi.update(_ngrams(toks, 2))
    top_uni = {w for w, _ in uni.most_common(60)}
    top_bi  = {" ".join(b) for b, _ in bi.most_common(60)}
    return top_uni, top_bi

def _sentence_score(s: str, top_uni, top_bi):
    if _is_low_info(s):
        return -1.0

    toks = [t for t in _tokens(s) if t not in STOPWORDS]
    if not toks:
        return -1.0

    uni_overlap = sum(1 for t in toks if t in top_uni) / max(1, len(toks))
    bi_list = _ngrams(toks, 2)
    bi_overlap = 0.0
    if bi_list:
        bi_overlap = sum(1 for b in bi_list if " ".join(b) in top_bi) / len(bi_list)

    length = len(toks)
    length_ok = 1.0 if 8 <= length <= 40 else 0.7 if 6 <= length <= 60 else 0.4

    number_bonus  = _number_score(s)
    decision_bonus = 0.15 if DECIDE_PAT.search(s) else 0.0
    sched_penalty  = -0.25 if SCHED_RE.search(s) else 0.0  # keep schedules out of takeaways

    score = (0.55 * uni_overlap +
             0.20 * bi_overlap +
             0.15 * length_ok +
             number_bonus +
             decision_bonus +
             sched_penalty)

    return float(score)

def _dedupe_lines(lines, max_sim=0.65):
    """Remove near-duplicates using Jaccard similarity."""
    out = []
    seen_sets = []
    for line in lines:
        aset = set(_tokens(line))
        if not aset:
            continue
        too_close = any(_jaccard(aset, b) >= max_sim for b in seen_sets)
        if not too_close:
            out.append(line)
            seen_sets.append(aset)
    return out

# -------------------- Action text normalization --------------------

def _normalize_action_text(s: str) -> str:
    """
    Make action items read like tasks:
    - "as the industrial designer, ..." -> "Industrial Designer — ..."
    - remove "we/you will/should/need to/going to" boilerplate
    - normalize "to be working on" -> "work on"
    """
    s = re.sub(r"\b(as the|for the)\s+([a-z ]+?),\s*", lambda m: m.group(2).title() + " — ", s, flags=re.I)
    s = re.sub(r"\b(you|we)\s+(are\s+going\s+to|going\s+to|will|should|need\s+to)\s+", "", s, flags=re.I)
    s = re.sub(r"\bto\s+be\s+working\s+on\b", "work on", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()

# -------------------- Public API --------------------

def generate_summary(transcript):
    """
    Generate a conservative, number-aware summary from a list of segments:
    Each segment is a dict with: {start: float, end: float, text: str}
    Returns a formatted plaintext summary (sections + bullet points).
    """
    # Flatten into sentence units while preserving time anchors
    sentence_units = []  # (sent_text, start, end)
    for seg in (transcript or []):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        start = float(seg.get("start", 0.0))
        end   = float(seg.get("end",   0.0))
        for sent in SENT_SPLIT(text):
            s = (sent or "").strip()
            if s:
                sentence_units.append((s, start, end))

    if not sentence_units:
        return "Key Takeaways:\n• No transcript content available."

    sentences = [s for s, _, _ in sentence_units]
    top_uni, top_bi = _salience_by_tf(sentences)

    # Score & rank sentences (higher = better)
    scored = []
    for s, st, et in sentence_units:
        sc = _sentence_score(s, top_uni, top_bi)
        if sc >= 0:
            scored.append((sc, s, st, et))
    scored.sort(key=lambda x: x[0], reverse=True)

    # Select key takeaways with diversity; skip question lines
    KEY_MAX = 6
    picks = []
    used_sets = []
    for sc, s, st, et in scored:
        if Q_PAT.search(s):  # do not use questions as key takeaways
            continue
        aset = set(_tokens(s))
        if not aset:
            continue
        if any(_jaccard(aset, b) >= 0.60 for b in used_sets):
            continue
        picks.append((s, st, et))
        used_sets.append(aset)
        if len(picks) >= KEY_MAX:
            break

    key_points = [p[0] for p in picks]
    key_points = _dedupe_lines(key_points)

    # Classify other sentences
    actions, issues, questions = [], [], []
    for s, st, et in sentence_units:
        if _is_low_info(s):
            continue
        if Q_PAT.search(s):
            questions.append(s)
        elif ISSUE_PAT.search(s):
            issues.append(s)
        elif ((ACTION_RE.search(s) or DECIDE_PAT.search(s)) and AGENT_RE.search(s)
              and not Q_PAT.search(s) and not s.strip().endswith("...")):
            actions.append(s)

    # Clean, normalize, dedupe, cap
    def _clean_and_tidy(xs, cap):
        xs2 = [x.strip() for x in xs if not PROMO_RE.search(x)]
        xs2 = [_cleanup_line(x) for x in xs2]
        xs2 = _dedupe_lines(xs2)
        return xs2[:cap]

    key_points = _clean_and_tidy(key_points, 6)

    # normalize action wording before final cleaning
    actions = [_normalize_action_text(a) for a in actions]
    actions = _clean_and_tidy(actions, 5)
    issues  = _clean_and_tidy(issues, 4)
    questions  = _clean_and_tidy(questions, 4)
    # keep only business-relevant open questions
    questions  = [q for q in questions if Q_KEEP_RE.search(q)]

    # Collect numeric highlights from the whole meeting
    numeric_bucket = []
    for s in sentences:
        numeric_bucket.extend(_collect_numeric_spans(s))

    # Normalize and consolidate numeric highlights
    def _norm_num(x: str) -> str:
        y = x.strip()
        # euro/eur normalization: "12, 50 euro" -> "€12.50", "25 euro" -> "€25"
        y = re.sub(r"\b(\d{1,3})[,\s](\d{2})\s*(euro|eur)\b", r"€\1.\2", y, flags=re.I)
        y = re.sub(r"\b(\d{1,3})\s*(euro|eur)\b", r"€\1", y, flags=re.I)
        # collapse spaces after currency symbol
        y = re.sub(r"€\s+", "€", y)
        y = re.sub(r"\$\s+", "$", y)
        y = re.sub(r"\b(RM|MYR|USD|EUR)\s+", r"\1 ", y, flags=re.I)
        # remove thousands separators when obvious
        y = re.sub(r"(\d),(?=\d{3}\b)", r"\1", y)
        y = re.sub(r"\s+", " ", y)
        return y

    numeric_norm = []
    seen_num = set()
    for x in numeric_bucket:
        y = _norm_num(x)
        low = y.lower()
        if low not in seen_num:
            seen_num.add(low)
            numeric_norm.append(y)

    # Build output sections
    out_lines = []

    if key_points:
        out_lines.append("Key Takeaways:")
        for k in key_points:
            out_lines.append(f"• {k}")
        out_lines.append("")

    if actions:
        out_lines.append("Action Items:")
        for a in actions:
            out_lines.append(f"• {a}")
        out_lines.append("")

    if issues:
        out_lines.append("Issues / Risks:")
        for r in issues:
            out_lines.append(f"• {r}")
        out_lines.append("")

    if questions:
        out_lines.append("Open Questions:")
        for q in questions:
            out_lines.append(f"• {q}")
        out_lines.append("")

    if numeric_norm:
        out_lines.append("Numbers Mentioned:")
        for n in numeric_norm[:8]:  # keep it readable
            out_lines.append(f"• {n}")
        out_lines.append("")

    if not out_lines:
        return "Key Takeaways:\n• (No salient content found.)"

    return "\n".join(out_lines).strip()