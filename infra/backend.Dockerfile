FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements-torch.txt backend/requirements.txt ./backend/

RUN pip install --no-cache-dir -r backend/requirements-torch.txt \
    && pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY models ./models
COPY data ./data

ENV PYTHONPATH=/app

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
