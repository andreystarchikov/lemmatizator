## Лемматизатор (FastAPI + spaCy + React)

Минималистичное веб‑приложение: на вход текст — на выходе частотный словарь лемм, отсортированный по убыванию.

### Стек
- Backend: FastAPI, spaCy (auto-download моделей), langdetect
- Frontend: React + Vite + TypeScript

### Локальный запуск

1) Бэкенд
```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

При первом запросе модель spaCy будет автоматически загружена (например, `ru_core_news_sm` или `en_core_web_sm`). Если загрузка невозможна (без интернета), будет использован упрощённый «blank» пайплайн.

2) Фронтенд
```
cd frontend
npm install
npm run dev
```

Vite проксирует `/api` на `http://localhost:8000`.

### API

- POST `/api/analyze`
```
{
  "text": "Ваш текст..."
}
```

Ответ:
```
{
  "language": "ru|en|unknown",
  "total_tokens": 123,
  "unique_lemmas": 45,
  "items": [{"lemma":"пример","count":5}, ...]
}
```

### Примечания
- Поддерживаются русский и английский языки. Детект — `langdetect` и/или эвристика по кириллице.
- Отбрасываются неалфавитные токены (`token.is_alpha`).

