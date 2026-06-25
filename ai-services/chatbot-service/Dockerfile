FROM python:3.11-slim

WORKDIR /app

# Install everything from requirements.txt in one pass. The CPU-only torch pin
# (--extra-index-url + torch==2.4.1+cpu) sits at the top of that file, so pip
# resolves the lightweight CPU wheel before sentence-transformers can pull the
# CUDA default. Installing sentence-transformers separately first (as before)
# defeated the pin and re-introduced the ~9.4GB CUDA torch.
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=300 --retries=5 -r requirements.txt

# Copy application code
COPY . .

# Build the ChromaDB knowledge base at image build time
# so it is ready when the container starts
RUN python scripts/build_knowledge_base.py

EXPOSE 5005

CMD ["python", "run.py"]
