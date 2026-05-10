"""Adds the cv-generation package root to sys.path for pytest.

This lets `from services...`, `from models...`, `from main import app`
resolve when running `pytest` from the cv-generation directory.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
