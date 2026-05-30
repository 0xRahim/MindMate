FROM python:3.11-slim

WORKDIR /app

# System packages
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Upgrade pip
RUN pip install --upgrade pip

# Install CPU-only torch first
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install app dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "app.py"]
