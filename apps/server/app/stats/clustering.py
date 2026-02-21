from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import ClusterMembership, ClusterSummary, Execution


def build_clusters(db: Session, run_id: str) -> list[ClusterSummary]:
    hdbscan, umap = _load_optional_backends()
    executions = db.query(Execution).filter(Execution.run_id == run_id).all()
    db.execute(delete(ClusterMembership).where(ClusterMembership.run_id == run_id))
    db.execute(delete(ClusterSummary).where(ClusterSummary.run_id == run_id))
    db.commit()

    if len(executions) < 3:
        return []

    texts = [f"{e.prompt} {e.response}" for e in executions]
    vectorizer = TfidfVectorizer(max_features=400, ngram_range=(1, 2), stop_words="english")
    matrix = vectorizer.fit_transform(texts)
    embeddings = matrix.toarray()

    if umap is not None and len(executions) >= 10:
        reducer = umap.UMAP(n_components=10, random_state=42)
        reduced = reducer.fit_transform(embeddings)
    else:
        reduced = embeddings

    if hdbscan is not None and len(executions) >= 20:
        clusterer = hdbscan.HDBSCAN(min_cluster_size=max(5, len(executions) // 40))
        labels = clusterer.fit_predict(reduced)
    else:
        n_clusters = min(6, max(2, len(executions) // 25))
        labels = KMeans(n_clusters=n_clusters, random_state=42, n_init=10).fit_predict(reduced)

    terms = vectorizer.get_feature_names_out()
    grouped: dict[int, list[int]] = defaultdict(list)
    for idx, label in enumerate(labels):
        grouped[int(label)].append(idx)

    summaries: list[ClusterSummary] = []
    memberships: list[ClusterMembership] = []

    for label, indexes in grouped.items():
        if label == -1:
            continue
        token_counter: Counter[str] = Counter()
        for idx in indexes:
            row = matrix[idx].toarray().ravel()
            k = min(5, len(row))
            top_indices = np.argpartition(row, -k)[-k:] if k > 0 else np.array([], dtype=int)
            for token_index in top_indices:
                token_counter[terms[token_index]] += float(row[token_index])
            memberships.append(
                ClusterMembership(
                    run_id=run_id,
                    execution_id=executions[idx].id,
                    cluster_id=int(label),
                    method="hdbscan" if hdbscan is not None else "kmeans",
                    distance=None,
                )
            )

        top_terms = [term for term, _ in token_counter.most_common(6)]
        label_text = " / ".join(top_terms[:3]) if top_terms else f"cluster-{label}"
        summaries.append(
            ClusterSummary(
                run_id=run_id,
                cluster_id=int(label),
                label=label_text,
                top_terms=top_terms,
                size=len(indexes),
            )
        )

    if memberships:
        db.add_all(memberships)
    if summaries:
        db.add_all(summaries)
    db.commit()

    return summaries


def list_clusters(db: Session, run_id: str) -> list[dict[str, Any]]:
    summaries = db.query(ClusterSummary).filter(ClusterSummary.run_id == run_id).all()
    return [
        {
            "cluster_id": summary.cluster_id,
            "label": summary.label,
            "top_terms": summary.top_terms,
            "size": summary.size,
        }
        for summary in summaries
    ]


def _load_optional_backends() -> tuple[Any, Any]:
    hdbscan_module = None
    umap_module = None
    try:  # pragma: no cover
        import hdbscan as _hdbscan  # type: ignore

        hdbscan_module = _hdbscan
    except Exception:
        hdbscan_module = None

    try:  # pragma: no cover
        import umap as _umap  # type: ignore

        umap_module = _umap
    except Exception:
        umap_module = None

    return hdbscan_module, umap_module
