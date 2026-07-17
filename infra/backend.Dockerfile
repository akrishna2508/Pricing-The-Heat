FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/

RUN pip install --no-cache-dir -r backend/requirements.txt \
    --index-url https://download.pytorch.org/whl/cpu

COPY backend ./backend
COPY models ./models
COPY data ./data

ENV PYTHONPATH=/app

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
