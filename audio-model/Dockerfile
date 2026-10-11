FROM python:3.11-slim

WORKDIR /app

# System packages: espeak-ng for Kokoro phonemization, curl for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Upgrade pip
RUN pip install --upgrade pip

# Install CPU-only torch first (see requirements.txt note: torch must
# stay unpinned there so this CPU wheel is kept and not overridden).
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install app dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://127.0.0.1:5000/health || exit 1

CMD ["python", "app.py"]
