"""Pre-download Hugging Face models into HF_MODEL_CACHE_DIR.

Best-effort by default: every download is wrapped in try/except and the
script always exits 0. Rationale — Docker build sandboxes often have
broken DNS to huggingface.co even when the runtime container has
working host networking. Failing the image build over a transient
build-time DNS issue is wasteful when the runtime can fetch instead.

PRE-FLIGHT: a DNS lookup is attempted first. If it fails, we skip ALL
downloads immediately. Without this, huggingface_hub's 5-retry
exponential-backoff chain runs ~3 minutes PER FILE on a broken-DNS
host, and a single model has dozens of file probes — turning a fast
fail into a 30-90 minute hang.

If the cache is incomplete after build, the first runtime request will
trigger a one-time download to the persisted `cv_model_cache` volume.

Skill NER candidates are tried in order; first that loads wins. If
none load, runtime falls back to Flan-T5 prompt-based extraction.

Set FAIL_FAST=1 in the build env to revert to hard-fail behaviour
(useful in CI where build-time network is reliable).
"""
from __future__ import annotations

import os
import socket
import sys

CACHE = os.environ.get("HF_MODEL_CACHE_DIR", "/app/model_cache")
FAIL_FAST = os.environ.get("FAIL_FAST", "0") == "1"

# Cap any single underlying HTTP request to 10s so we surface broken
# networks fast. Recognised by huggingface_hub for download timeouts.
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "10")

# Default to jjzha/jobbert_skill_extraction — a BERT-base model (~440MB)
# fine-tuned for skill extraction. Replaced the previous default
# jjzha/escoxlmr_skill_extraction (XLM-R-large, ~2.2GB) which made the
# published image ~2.9GB and painful to pull on slow links. Same author,
# same task, ~5x smaller. The previous algiraldohe/lm-ner-skills-recognition
# was removed from HuggingFace and always fails.
NER_CANDIDATES = [
    os.environ.get("HF_SKILL_NER_MODEL", "jjzha/jobbert_skill_extraction"),
    "jjzha/jobspanbert-base-cased",
]


def _hf_reachable() -> bool:
    """Resolve huggingface.co with a 5s socket timeout.

    A failure here means downloads cannot succeed, no point trying
    them — every download attempt would take many minutes to give up.
    """
    socket.setdefaulttimeout(5)
    try:
        socket.gethostbyname("huggingface.co")
        return True
    except OSError as exc:
        print(
            f"[preload] DNS lookup for huggingface.co failed ({exc}). "
            "Skipping all downloads — runtime will fetch instead.",
            file=sys.stderr,
        )
        return False


def _try(label: str, fn) -> bool:
    try:
        fn()
        print(f"[preload] OK: {label}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[preload] SKIP: {label} — {exc}", file=sys.stderr)
        if FAIL_FAST:
            raise
        return False


def preload_semantic() -> None:
    from sentence_transformers import SentenceTransformer  # pyright: ignore[reportMissingImports]

    SentenceTransformer(
        "sentence-transformers/all-MiniLM-L6-v2", cache_folder=CACHE
    )


def preload_summary() -> None:
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # pyright: ignore[reportMissingImports]

    AutoTokenizer.from_pretrained("google/flan-t5-small", cache_dir=CACHE)
    AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-small", cache_dir=CACHE)


def preload_ner() -> bool:
    from transformers import pipeline  # pyright: ignore[reportMissingImports]

    for model_id in NER_CANDIDATES:
        if not model_id:
            continue
        try:
            pipeline(
                "token-classification",
                model=model_id,
                aggregation_strategy="simple",
                model_kwargs={"cache_dir": CACHE},
            )
            print(f"[preload] OK: skill NER ({model_id})")
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"[preload] SKIP NER candidate {model_id} — {exc}", file=sys.stderr)
    print(
        "[preload] WARNING: no skill NER model cached. Runtime falls back "
        "to Flan-T5 prompt-based extraction.",
        file=sys.stderr,
    )
    return False


def main() -> int:
    print(f"[preload] cache dir: {CACHE} (fail_fast={FAIL_FAST})")
    if not _hf_reachable():
        if FAIL_FAST:
            print("[preload] FAIL_FAST=1 and HF unreachable — aborting.", file=sys.stderr)
            return 1
        print("[preload] done (skipped — runtime will fetch)")
        return 0

    semantic_ok = _try("semantic (all-MiniLM-L6-v2)", preload_semantic)
    summary_ok = _try("summary (flan-t5-small)", preload_summary)
    preload_ner()

    if not semantic_ok or not summary_ok:
        print(
            "[preload] required models not cached at build time. The runtime "
            "container will download them on first request "
            "(needs network access to huggingface.co).",
            file=sys.stderr,
        )
    print("[preload] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
