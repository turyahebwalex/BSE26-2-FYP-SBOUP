"""Singleton holder for the three Hugging Face transformer models the
learning engine depends on.

Loaded once during the FastAPI lifespan startup. Per-request inference
just reuses these in-memory handles — no per-request model loading.

Design notes:
- MiniLM (semantic) is the only required model. `models_loaded` flips
  True iff it loaded.
- Flan-T5 (summary) drives the §6.6 "WHY THIS COURSE?" rationale and
  the pathway header. If it fails to load, `explanation_generator` falls
  back to deterministic fact-pack templates — the worker still sees a
  reason next to every resource.
- Skill NER (`jjzha/escoxlmr_skill_extraction`) drives §6.7 bio mining
  and resource-description tagging. Best-effort load: on failure
  `skill_extractor` falls through to a Flan-T5 prompt.
"""
from __future__ import annotations

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
            cls._instance.summary_pipeline = None
            cls._instance.ner_pipeline = None
            cls._instance._models_loaded = False
        return cls._instance

    def load_models(self) -> None:
        # Local imports — keeps the import graph cheap for tests that
        # mock this module without needing torch/transformers on disk.
        from sentence_transformers import SentenceTransformer
        from transformers import (
            AutoModelForSeq2SeqLM,
            AutoTokenizer,
            pipeline,
        )

        cache = config.HF_MODEL_CACHE_DIR

        logger.info("Loading semantic model: %s", config.HF_SEMANTIC_MODEL)
        try:
            self.semantic_model = SentenceTransformer(
                config.HF_SEMANTIC_MODEL, cache_folder=cache
            )
            self._models_loaded = True
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Semantic model failed to load (%s). Service will degrade to "
                "exact-match-only gap analysis and keyword-overlap relevance.",
                exc,
            )
            self.semantic_model = None

        logger.info("Loading summary pipeline: %s", config.HF_SUMMARY_MODEL)
        try:
            tok = AutoTokenizer.from_pretrained(
                config.HF_SUMMARY_MODEL, cache_dir=cache
            )
            mdl = AutoModelForSeq2SeqLM.from_pretrained(
                config.HF_SUMMARY_MODEL, cache_dir=cache
            )
            self.summary_pipeline = pipeline(
                "text2text-generation", model=mdl, tokenizer=tok
            )
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.warning(
                "Summary model failed to load (%s). Falling back to fact-pack "
                "templates for resource and pathway explanations.",
                exc,
            )
            self.summary_pipeline = None

        logger.info("Loading skill NER pipeline: %s", config.HF_SKILL_NER_MODEL)
        try:
            self.ner_pipeline = pipeline(
                "token-classification",
                model=config.HF_SKILL_NER_MODEL,
                aggregation_strategy="simple",
                model_kwargs={"cache_dir": cache},
            )
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.warning(
                "Skill NER failed to load (%s). Falling back to Flan-T5 prompt "
                "extraction for bio mining and resource skill tagging.",
                exc,
            )
            self.ner_pipeline = None

        logger.info(
            "AI model manager ready (semantic=%s, summary=%s, ner=%s)",
            self.semantic_model is not None,
            self.summary_pipeline is not None,
            self.ner_pipeline is not None,
        )

    @property
    def models_loaded(self) -> bool:
        return self._models_loaded


ai_models = AIModelManager()


@asynccontextmanager
async def lifespan(app):  # noqa: ARG001 — FastAPI passes the app instance
    ai_models.load_models()
    yield
