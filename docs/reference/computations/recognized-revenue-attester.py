#!/usr/bin/env python3
"""Turn a run receipt for Recognized revenue into a verdict.

Deterministic code, never a model — that is the whole requirement the spec puts
on an attester. It reads the receipt and the stored computation and decides;
it does not summarize, infer, or ask anything.

Illustrative: this file exists so the worked example declares a real attester
rather than a dangling path. Studio performs the equivalent provenance check
itself (crates/okf-core/src/attest.rs) without executing this or any other
attester, because running arbitrary code out of a bundle is not something a
reader should do.
"""

import json
import re
import sys

PARAMETERS = ("fiscal_year", "region")


def canonicalize(sql: str) -> str:
    """Ignore comments, whitespace and case — and nothing else.

    Deliberately shallow. This is a provenance check, so a rewrite that only
    reorders or renames still passes; claiming otherwise would overstate what
    the verdict proves.
    """
    lines = (re.sub(r"--.*$", "", line).strip() for line in sql.splitlines())
    return re.sub(r"\s+", " ", " ".join(line for line in lines if line)).lower()


def matches_with_holes(stored: str, executed: str) -> bool:
    """Compare as a shape, treating each parameter placeholder as a hole.

    A bound parameter legitimately differs from its placeholder: that is the one
    substitution an agent is allowed to make. Binding syntax belongs to the
    runtime, so this never tries to bind anything itself.
    """
    segments = [stored]
    for name in PARAMETERS:
        for spelling in (f"@{name}", f":{name}", f"${name}"):
            segments = [part for segment in segments for part in segment.split(spelling)]

    cursor = 0
    for segment in segments:
        if not segment:
            continue
        found = executed.find(segment, cursor)
        if found == -1:
            return False
        cursor = found + len(segment)
    return True


def main() -> int:
    receipt = json.load(sys.stdin)
    with open(sys.argv[1], encoding="utf-8") as handle:
        stored = canonicalize(handle.read())

    for field in ("job_id", "executed_sql", "result"):
        if not str(receipt.get(field, "")).strip():
            print(f"FAILED: the receipt is missing {field}", file=sys.stderr)
            return 1

    executed = canonicalize(receipt["executed_sql"])
    if executed != stored and not matches_with_holes(stored, executed):
        print("FAILED: the executed SQL is not the sanctioned computation", file=sys.stderr)
        return 1

    # Provenance only. Fidelity means re-reading the result by job id, which
    # needs the warehouse; an attester that guessed here would be worse than one
    # that says what it did not check.
    print("PASSED: provenance established; fidelity not checked here")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
