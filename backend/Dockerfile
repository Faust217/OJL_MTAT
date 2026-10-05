FROM python:3.10-slim-bookworm

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/cache/huggingface \
    NLTK_DATA=/cache/nltk_data

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        wkhtmltopdf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements-linux.txt /app/requirements-linux.txt
COPY backend/face_recognition-1.3.0-py2.py3-none-any.whl /app/face_recognition-1.3.0-py2.py3-none-any.whl

RUN python -m pip install --no-cache-dir -r /app/requirements-linux.txt

COPY backend/ /app/

EXPOSE 8000

CMD ["sh", "-c", "mkdir -p \"$NLTK_DATA\" && exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1"]
