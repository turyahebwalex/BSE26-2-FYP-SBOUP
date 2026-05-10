FROM python:3.11-slim

WORKDIR /app

# Install dependencies in two steps:
# 1. sentence-transformers pulls in torch (~500MB) — give it extra time
# 2. Everything else is small and fast
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=300 --retries=5 sentence-transformers==2.7.0
RUN pip install --no-cache-dir --timeout=120 --retries=5 -r requirements.txt

# Copy application code
COPY . .

# Build the ChromaDB knowledge base at image build time
# so it is ready when the container starts
RUN python scripts/build_knowledge_base.py

EXPOSE 5005

CMD ["python", "run.py"]
