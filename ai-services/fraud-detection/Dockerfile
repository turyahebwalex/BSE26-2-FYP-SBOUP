FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
# Large ML wheels (scikit-learn, scipy, xgboost) are slow to pull on campus /
# metered Wi-Fi; raise the per-read timeout and retry so the build doesn't fail
# on a transient ReadTimeoutError mid-download.
RUN pip install --no-cache-dir \
        --timeout 300 --retries 15 \
        -r requirements.txt

COPY . .

EXPOSE 5002

CMD ["python", "run.py"]
