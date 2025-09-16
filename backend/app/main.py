from __future__ import annotations

from collections import Counter
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


_loaded_models: Dict[str, "spacy.language.Language"] = {}


def _detect_language(text: str) -> str:
    # Force Russian only
    return "ru"


def _ensure_spacy_model(lang: str):
    import spacy
    from spacy.util import is_package
    from spacy.cli import download as spacy_download

    cache_key = "ru"
    if cache_key in _loaded_models:
        return _loaded_models[cache_key]

    model_name = "ru_core_news_sm"

    if not is_package(model_name):
        # Try to download the model on the fly
        try:
            spacy_download(model_name)
        except Exception as e:
            # As a last resort, try a blank pipeline (limited lemmatization)
            nlp = spacy.blank("ru")
            _loaded_models[cache_key] = nlp
            return nlp

    try:
        nlp = spacy.load(model_name)
    except Exception:
        # Fallback to blank if load failed
        nlp = spacy.blank("ru")

    _loaded_models[cache_key] = nlp
    return nlp


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")

    lang = "ru"
    nlp = _ensure_spacy_model(lang)

    doc = nlp(text)

    # Use alpha tokens only; keep lemmatized lowercase
    lemmas: List[str] = []
    for token in doc:
        if token.is_alpha:
            lemma = token.lemma_.lower() if token.lemma_ else token.text.lower()
            lemmas.append(lemma)

    counts = Counter(lemmas)
    items = [
        LemmaCount(lemma=lemma, count=count)
        for lemma, count in counts.most_common()
    ]

    # Build bigrams over lemmas with stop-words removed
    # Use spaCy language stop words when available
    try:
        stop_words = {w.lower() for w in getattr(nlp.Defaults, "stop_words", set())}
    except Exception:
        stop_words = set()

    lemmas_wo_stop = [l for l in lemmas if l not in stop_words]

    bigram_strings: List[str] = []
    for i in range(len(lemmas_wo_stop) - 1):
        left = lemmas_wo_stop[i]
        right = lemmas_wo_stop[i + 1]
        if left and right:
            bigram_strings.append(f"{left} {right}")
    bigram_counts = Counter(bigram_strings)
    bigrams = [
        BigramCount(bigram=bg, count=cnt)
        for bg, cnt in bigram_counts.most_common() if cnt > 1
    ]

    # Trigram counts over adjacent lemmas (without stop-words)
    trigram_strings: List[str] = []
    for i in range(len(lemmas_wo_stop) - 2):
        a = lemmas_wo_stop[i]
        b = lemmas_wo_stop[i + 1]
        c = lemmas_wo_stop[i + 2]
        if a and b and c:
            trigram_strings.append(f"{a} {b} {c}")
    trigram_counts = Counter(trigram_strings)
    trigrams = [
        TrigramCount(trigram=tg, count=cnt)
        for tg, cnt in trigram_counts.most_common() if cnt > 1
    ]

    return AnalyzeResponse(
        language="ru",
        total_tokens=len(lemmas),
        unique_lemmas=len(counts),
        items=items,
        total_bigrams=len(bigram_strings),
        unique_bigrams=len(bigram_counts),
        bigrams=bigrams,
        total_trigrams=len(trigram_strings),
        unique_trigrams=len(trigram_counts),
        trigrams=trigrams,
    )


# To run: uvicorn app.main:app --reload --port 8000

