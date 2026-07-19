FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements-torch.txt backend/requirements.txt ./backend/

RUN pip install --no-cache-dir -r backend/requirements-torch.txt \
    && pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY models ./models
COPY data ./data
COPY infra/render_start.sh ./infra/render_start.sh

# deploy_artifacts/ ships trained weights/fits WITH the image -- Render (and
# any other host building from this repo) has no access to local artifacts,
# and models/artifacts/*, data/processed/* are otherwise gitignored. This
# COPY overlays them onto the exact runtime paths backend/main.py reads.
COPY deploy_artifacts/models/artifacts/ ./models/artifacts/
COPY deploy_artifacts/data/processed/ ./data/processed/

ENV PYTHONPATH=/app
RUN chmod +x infra/render_start.sh

EXPOSE 8000

CMD ["infra/render_start.sh"]
