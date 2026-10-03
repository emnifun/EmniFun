#!/usr/bin/env python3
"""Build EmniFun's comprehensive five-letter English guess vocabulary.

The source is the English Speller Database (ESDB), the current SCOWL project.
This script intentionally has NO maximum word-count limit.

It generates:
  data/valid-guesses.json
  data/vocabulary-build.json

The answer pool is kept separately in data/answers.json.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import date
from pathlib import Path


WORD_RE = re.compile(r"^[a-z]{5}$")

# These ESDB classes are not ordinary English vocabulary for player guesses.
EXCLUDED_POS_CLASSES = (
    "person",
    "surname",
    "place",
    "name",
    "demonym",
    "trademark",
    "upper",
    "name?",
    "upper?",
    "abbr",
    "abbr?",
)

EXCLUDED_POS_CATEGORIES = ("nonword", "wordpart")


def run(command: list[str], cwd: Path) -> str:
    return subprocess.run(
        command,
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    ).stdout


def build_database(esdb_dir: Path) -> Path:
    db = esdb_dir / "scowl.db"
    subprocess.run(["python3", "combine.py", "create-db", str(db)], cwd=esdb_dir, check=True)
    return db


def generate_source_words(esdb_dir: Path, db: Path) -> list[str]:
    command = [
        "./scowl",
        "word-list",
        "--db",
        str(db),
        "85",
        "A,B,Z,C,D",
        "6",
        "--deaccent",
        "--categories=no-default",
        "--wo-pos-classes=" + ",".join(EXCLUDED_POS_CLASSES),
        "--wo-pos-categories=" + ",".join(EXCLUDED_POS_CATEGORIES),
    ]

    raw = run(command, esdb_dir)
    words = set()

    for line in raw.splitlines():
        word = line.strip().lower()
        if WORD_RE.fullmatch(word):
            words.add(word)

    return sorted(words)


def write_outputs(root: Path, words: list[str]) -> None:
    data_dir = root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    (data_dir / "valid-guesses.json").write_text(
        json.dumps(words, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    metadata = {
        "generatedAt": date.today().isoformat(),
        "source": {
            "name": "English Speller Database (ESDB)",
            "repository": "https://github.com/en-wl/wordlist",
            "ref": "1e5b7d3a72f47a71da5d28686c1dd4b397178485",
            "selection": "size 85, English/American/British/Canadian/Australian spellings, variant levels 0-6",
        },
        "filtering": {
            "length": 5,
            "alphabet": "A-Z",
            "excludedPosClasses": list(EXCLUDED_POS_CLASSES),
            "excludedPosCategories": list(EXCLUDED_POS_CATEGORIES),
            "deduplicated": True,
            "artificialWordCountLimit": False,
        },
        "wordCount": len(words),
    }

    (data_dir / "vocabulary-build.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--esdb", required=True, type=Path)
    parser.add_argument("--output-root", default=".", type=Path)
    args = parser.parse_args()

    db = build_database(args.esdb)
    words = generate_source_words(args.esdb, db)
    write_outputs(args.output_root.resolve(), words)
    print(f"Generated {len(words)} five-letter words.")


if __name__ == "__main__":
    main()
