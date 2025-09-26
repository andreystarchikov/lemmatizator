from __future__ import annotations

from collections import Counter
import re
from functools import lru_cache
from typing import Dict, List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(title="Lemma Analyzer API")

# CORS for local dev (Vite default ports)
app.add_middleware(
    CORSMiddleware,
    # In production we allow any origin so that a separately hosted frontend can call the API.
    # If you want to restrict, pass exact domains via env and replace ["*"] accordingly.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Input text to analyze")


class LemmaCount(BaseModel):
    lemma: str
    count: int


class AnalyzeResponse(BaseModel):
    language: Literal["en", "ru", "unknown"]
    total_tokens: int
    unique_lemmas: int
    items: List[LemmaCount]
    items_filtered: List[LemmaCount]
    total_bigrams: int
    unique_bigrams: int
    bigrams: List["BigramCount"]
    total_trigrams: int
    unique_trigrams: int
    trigrams: List["TrigramCount"]


class BigramCount(BaseModel):
    bigram: str
    count: int


class TrigramCount(BaseModel):
    trigram: str
    count: int


# Resolve forward refs for Pydantic v2
AnalyzeResponse.model_rebuild()

_pymorphy_analyzer = None  # lazy-initialized pymorphy3 analyzer

# Precompiled regex for alpha-only tokens (Latin/Russian)
_ALPHA_RE = re.compile(r"[A-Za-zА-Яа-яЁё]+")



@lru_cache(maxsize=20000)
def _analyze_token_cached(token: str) -> tuple[str | None, str | None]:
    """Return (lemma, POS) using a bounded LRU cache to reduce CPU.

    The function depends on the global `_pymorphy_analyzer` which is lazily
    initialized in the request handler. We intentionally cache only
    small immutable strings to keep memory usage bounded and safe across
    requests.
    """
    analyzer = _pymorphy_analyzer
    if analyzer is None:
        return None, None
    parsed = analyzer.parse(token)
    if not parsed:
        return None, None
    p = parsed[0]
    pos = getattr(p.tag, "POS", None)
    return p.normal_form, pos


def _detect_language(text: str) -> str:
    # Force Russian only
    return "ru"


# spaCy path removed; only razdel+pymorphy3 is used


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")

    # Single engine: razdel tokenizer + pymorphy3 lemmatizer with POS filtering
    try:
        from razdel import tokenize as razdel_tokenize
        from pymorphy3 import MorphAnalyzer
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"pymorphy engine unavailable: {e}")

    global _pymorphy_analyzer
    if _pymorphy_analyzer is None:
        _pymorphy_analyzer = MorphAnalyzer()
    analyzer = _pymorphy_analyzer

    # Build alpha tokens directly without an intermediate full token list
    alpha_tokens = []
    for tok in razdel_tokenize(text):
        t = tok.text.lower()
        if _ALPHA_RE.fullmatch(t):
            alpha_tokens.append(t)
    stop_pos = {"PREP", "CONJ", "PRCL", "INTJ"}

    # Single pass over tokens using cached morphological analysis
    lemmas_raw: List[str] = []
    lemmas: List[str] = []
    for t in alpha_tokens:
        lemma, pos = _analyze_token_cached(t)
        if lemma is None:
            continue
        # Raw lemmas (no POS filtering)
        lemmas_raw.append(lemma)
        # POS-filtered lemmas
        if pos and pos in stop_pos:
            continue
        lemmas.append(lemma)

    counts_raw = Counter(lemmas_raw)
    items = [
        LemmaCount(lemma=lemma, count=count)
        for lemma, count in counts_raw.most_common()
    ]

    counts_filtered = Counter(lemmas)
    items_filtered = [
        LemmaCount(lemma=lemma, count=count)
        for lemma, count in counts_filtered.most_common()
    ]

    # Build bigram counts over lemmas (stop words already filtered by POS)
    lemmas_wo_stop = lemmas
    bigram_counts: Counter[str] = Counter()
    if len(lemmas_wo_stop) >= 2:
        for i in range(len(lemmas_wo_stop) - 1):
            left = lemmas_wo_stop[i]
            right = lemmas_wo_stop[i + 1]
            if left and right:
                bg = f"{left} {right}"
                bigram_counts[bg] += 1
    bigrams = [
        BigramCount(bigram=bg, count=cnt)
        for bg, cnt in bigram_counts.most_common() if cnt > 1
    ]

    # Trigram counts over adjacent lemmas (without stop-words)
    trigram_counts: Counter[str] = Counter()
    if len(lemmas_wo_stop) >= 3:
        for i in range(len(lemmas_wo_stop) - 2):
            a = lemmas_wo_stop[i]
            b = lemmas_wo_stop[i + 1]
            c = lemmas_wo_stop[i + 2]
            if a and b and c:
                tg = f"{a} {b} {c}"
                trigram_counts[tg] += 1
    trigrams = [
        TrigramCount(trigram=tg, count=cnt)
        for tg, cnt in trigram_counts.most_common() if cnt > 1
    ]

    return AnalyzeResponse(
        language="ru",
        total_tokens=len(lemmas_raw),
        unique_lemmas=len(counts_raw),
        items=items,
        items_filtered=items_filtered,
        total_bigrams=max(len(lemmas_wo_stop) - 1, 0),
        unique_bigrams=len(bigram_counts),
        bigrams=bigrams,
        total_trigrams=max(len(lemmas_wo_stop) - 2, 0),
        unique_trigrams=len(trigram_counts),
        trigrams=trigrams,
    )


# To run: uvicorn app.main:app --reload --port 8000



