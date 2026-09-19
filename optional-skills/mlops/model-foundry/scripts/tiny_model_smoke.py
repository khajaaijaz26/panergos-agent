#!/usr/bin/env python3
"""Train a deterministic character-bigram smoke model with the standard library."""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_CORPUS = """Panergos resumes verified work from durable evidence.
Small models make lifecycle checks cheap and repeatable.
Data rights, held-out evaluation, and honest limits come first.
"""


def _pairs(text: str) -> list[tuple[str, str]]:
    return list(zip(text, text[1:]))


def _train_and_validation(
    text: str,
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    pairs = _pairs(text)
    validation = [pair for index, pair in enumerate(pairs) if index % 5 == 0]
    training = [pair for index, pair in enumerate(pairs) if index % 5 != 0]
    if not training or not validation:
        raise ValueError("corpus must contain at least 10 characters")
    return training, validation


def _fit(training: list[tuple[str, str]]) -> dict[str, Counter[str]]:
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    for current, following in training:
        counts[current][following] += 1
    return dict(counts)


def _probability(
    counts: dict[str, Counter[str]], current: str, following: str, vocabulary_size: int
) -> float:
    row = counts.get(current, Counter())
    return (row[following] + 1) / (sum(row.values()) + vocabulary_size)


def _perplexity(
    counts: dict[str, Counter[str]],
    validation: list[tuple[str, str]],
    vocabulary_size: int,
) -> float:
    negative_log_likelihood = -sum(
        math.log(_probability(counts, current, following, vocabulary_size))
        for current, following in validation
    ) / len(validation)
    return math.exp(negative_log_likelihood)


def _generate(
    counts: dict[str, Counter[str]],
    vocabulary: list[str],
    start: str,
    seed: int,
    tokens: int,
) -> str:
    rng = random.Random(seed)
    output = [start]
    current = start
    for _ in range(tokens - 1):
        row = counts.get(current, Counter())
        weights = [row[character] + 1 for character in vocabulary]
        current = rng.choices(vocabulary, weights=weights, k=1)[0]
        output.append(current)
    return "".join(output)


def train(corpus: str, output: Path, seed: int, tokens: int) -> tuple[Path, Path]:
    if len(corpus) < 10:
        raise ValueError("corpus must contain at least 10 characters")
    if tokens < 1:
        raise ValueError("tokens must be positive")

    vocabulary = sorted(set(corpus))
    training, validation = _train_and_validation(corpus)
    counts = _fit(training)
    validation_perplexity = _perplexity(counts, validation, len(vocabulary))
    sample = _generate(counts, vocabulary, corpus[0], seed, tokens)

    output.mkdir(parents=True, exist_ok=True)
    model_path = output / "model.json"
    metrics_path = output / "metrics.json"
    model = {
        "schema_version": 1,
        "model_type": "character_bigram",
        "smoothing": "add_one",
        "seed": seed,
        "vocabulary": vocabulary,
        "transitions": {
            current: dict(sorted(row.items()))
            for current, row in sorted(counts.items())
        },
    }
    metrics = {
        "train_pairs": len(training),
        "validation_pairs": len(validation),
        "vocabulary_size": len(vocabulary),
        "validation_perplexity": round(validation_perplexity, 6),
        "sample": sample,
        "limitations": "Educational lifecycle smoke model; not a production language model.",
    }
    model_path.write_text(
        json.dumps(model, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    metrics_path.write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return model_path, metrics_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, help="Authorized UTF-8 training text")
    parser.add_argument("--output", type=Path, required=True, help="Artifact directory")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--tokens", type=int, default=160)
    args = parser.parse_args()

    corpus = args.corpus.read_text(encoding="utf-8") if args.corpus else DEFAULT_CORPUS
    try:
        model_path, metrics_path = train(corpus, args.output, args.seed, args.tokens)
    except ValueError as exc:
        parser.error(str(exc))
    print(f"model={model_path}")
    print(f"metrics={metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
