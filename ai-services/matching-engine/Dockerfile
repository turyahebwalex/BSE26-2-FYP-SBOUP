FROM python:3.11-slim

WORKDIR /app

# libgomp1 is required by LightGBM for parallel tree building
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 --retries=5 -r requirements.txt

COPY . .

EXPOSE 5001

CMD ["python", "run.py"]
