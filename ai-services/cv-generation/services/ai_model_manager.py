"""Singleton holder for the three Hugging Face transformer models.

Loaded once during the FastAPI lifespan startup. Per-request inference
just reuses these in-memory handles — no per-request model loading.

Design notes:
- The skill NER model can fail to load (HF outage, model renamed, etc).
  We treat that as non-fatal: `ner_pipeline` becomes None and
  `keyword_extractor.py` falls back to a Flan-T5 prompt.
- `models_loaded` becomes True once the two *required* models (semantic
  and summary) have loaded. NER is best-effort.
"""
import logging
from contextlib import asynccontextmanager
from typing import Optional

import config

logger = logging.getLogger(__name__)


class AIModelManager:
    _instance: Optional["AIModelManager"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.semantic_model = None
            cls._instance.ner_pipeline = None
            cls._instance.summary_pipeline = None
            cls._instance._models_loaded = False
        return cls._instance

    def load_models(self) -> None:
        # Local imports — keeps the import graph cheap for tests that mock
        # this module without needing torch/transformers on disk.
        from sentence_transformers import SentenceTransformer
        from transformers import (
            AutoModelForSeq2SeqLM,
            AutoTokenizer,
            pipeline,
        )

        cache = config.HF_MODEL_CACHE_DIR

        logger.info("Loading semantic model: %s", config.HF_SEMANTIC_MODEL)
        self.semantic_model = SentenceTransformer(
            config.HF_SEMANTIC_MODEL, cache_folder=cache
        )

        logger.info("Loading skill NER pipeline: %s", config.HF_SKILL_NER_MODEL)
        try:
            self.ner_pipeline = pipeline(
                "token-classification",
                model=config.HF_SKILL_NER_MODEL,
                aggregation_strategy="simple",
                model_kwargs={"cache_dir": cache},
            )
        except Exception as exc:  # noqa: BLE001 — best-effort load
            logger.warning(
                "Skill NER failed to load (%s). Falling back to LLM-based extraction.",
                exc,
            )
            self.ner_pipeline = None

        logger.info("Loading summary pipeline: %s", config.HF_SUMMARY_MODEL)
        tok = AutoTokenizer.from_pretrained(config.HF_SUMMARY_MODEL, cache_dir=cache)
        mdl = AutoModelForSeq2SeqLM.from_pretrained(
            config.HF_SUMMARY_MODEL, cache_dir=cache
        )
        self.summary_pipeline = pipeline("text2text-generation", model=mdl, tokenizer=tok)

        self._models_loaded = True
        logger.info("AI model manager ready")

    @property
    def models_loaded(self) -> bool:
        return self._models_loaded


ai_models = AIModelManager()


@asynccontextmanager
async def lifespan(app):  # noqa: ARG001 — FastAPI passes the app instance
    ai_models.load_models()
    yield
