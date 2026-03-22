#!/usr/bin/env python3
"""
Apply KEY=VALUE lines to the current Railway service via CLI.

Prerequisites:
  railway login
  railway link   # from repo root, correct project/service

Usage:
  python3 scripts/railway/apply_railway_vars.py scripts/railway/backend.env.local
  python3 scripts/railway/apply_railway_vars.py scripts/railway/backend.env.local -- -s OtherService

Lines starting with # or empty lines are skipped.
Values can be quoted with " or '.
"""
from __future__ import annotations

import subprocess
import sys


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__.strip())
        sys.exit(0 if args else 1)

    path = args[0]
    extra: list[str] = []
    if "--" in args:
        idx = args.index("--")
        extra = args[idx + 1 :]
        args = args[:idx]

    path = args[0]
    extra = list(args[1:]) + extra

    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            if not key:
                continue
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            cmd = ["railway", "variable", "set", f"{key}={val}", *extra]
            print("→", key, "=", "(set)")
            subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
