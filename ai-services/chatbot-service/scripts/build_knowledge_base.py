"""
SBOUP Chatbot Service — Build Knowledge Base
Reads all markdown files from knowledge/ and indexes them into a
persistent ChromaDB vector store at chroma_db/.

Run once before starting the service (or at Docker build time):
    python scripts/build_knowledge_base.py
"""

import os
import glob
import json
import time

from sentence_transformers import SentenceTransformer
import chromadb

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWLEDGE_DIR = os.path.join(BASE_DIR, "knowledge")
CHROMA_DIR    = os.path.join(BASE_DIR, "chroma_db")

# ── Config ────────────────────────────────────────────────────────────────────
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
COLLECTION_NAME  = "sboup_knowledge"
CHUNK_SIZE       = 1500
CHUNK_OVERLAP    = 200


def chunk_text(text: str) -> list[str]:
    paragraphs = text.split("\n\n")
    chunks, current = [], ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 <= CHUNK_SIZE:
            current = (current + "\n\n" + para).strip()
        else:
            if current:
                chunks.append(current)
            carry  = current[-CHUNK_OVERLAP:] if current else ""
            current = (carry + "\n\n" + para).strip()
    if current:
        chunks.append(current)
    return chunks


def main():
    print("Building SBOUP knowledge base...")

    embed_model   = SentenceTransformer(EMBED_MODEL_NAME)
    chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)

    try:
        chroma_client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass

    collection = chroma_client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    md_files = sorted(glob.glob(os.path.join(KNOWLEDGE_DIR, "*.md")))
    if not md_files:
        print(f"ERROR: No markdown files found in {KNOWLEDGE_DIR}")
        return

    all_chunks, all_ids, all_metas = [], [], []

    for filepath in md_files:
        filename = os.path.basename(filepath)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        chunks = chunk_text(content)
        for i, chunk in enumerate(chunks):
            all_chunks.append(chunk)
            all_ids.append(f"{filename}_chunk_{i}")
            all_metas.append({"source": filename, "chunk_idx": i})
        print(f"  {filename:<35} → {len(chunks)} chunks")

    print(f"\nEmbedding {len(all_chunks)} chunks...")
    embeddings = embed_model.encode(all_chunks, show_progress_bar=True).tolist()

    collection.upsert(
        ids=all_ids,
        embeddings=embeddings,
        documents=all_chunks,
        metadatas=all_metas,
    )

    print(f"\nKnowledge base ready: {collection.count()} chunks indexed")
    print(f"ChromaDB path: {CHROMA_DIR}")


if __name__ == "__main__":
    main()
