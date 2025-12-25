FROM python:3.10-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    ffmpeg \
    pkg-config \
    python3-dev \
    gcc \
    g++ \
    make \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONPATH=/app

# Копирование и установка зависимостей
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir fastapi==0.104.1 uvicorn[standard]==0.24.0 python-multipart==0.0.6 python-docx==1.1.0
RUN pip install --no-cache-dir "av>=11.0.0"
RUN pip install --no-cache-dir --no-deps faster-whisper==0.9.0
RUN pip install --no-cache-dir ctranslate2 onnxruntime numpy huggingface-hub tokenizers requests

# Копирование кода (правильная структура)
COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p uploads results
EXPOSE 80

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "80"]