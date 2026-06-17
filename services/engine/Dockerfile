# NTU EEE Co-Pilot engine — private, secret-gated compute for Fly.io.
#
# Build from the REPO ROOT so the context includes ./rulebook:
#   flyctl deploy --config services/engine/fly.toml --dockerfile services/engine/Dockerfile .
#
# The repo's relative layout is preserved inside the image so rulebook.py resolves
# the rulebook dir: Path(__file__).resolve().parents[3] == /code  ->  /code/rulebook.
FROM python:3.12-slim

WORKDIR /code

# Install deps first for layer caching.
COPY services/engine/requirements.txt services/engine/requirements.txt
RUN pip install --no-cache-dir -r services/engine/requirements.txt

# App code + the rulebook it reads (single source of truth).
COPY services/engine services/engine
COPY rulebook rulebook

WORKDIR /code/services/engine
EXPOSE 8080
# Production: no --reload, single worker is ample for this workload. Binds all
# interfaces inside the container; Fly routes to internal_port 8080 (fly.toml).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
