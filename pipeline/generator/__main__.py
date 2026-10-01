"""python -m generator [--out DIR] [--seed N]"""

import argparse
from pathlib import Path

from . import config, generate


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Amazon report files.")
    parser.add_argument("--out", type=Path, default=Path("output"), help="output folder")
    parser.add_argument("--seed", type=int, default=config.SEED)
    args = parser.parse_args()

    counts = generate(args.out, args.seed)
    for name, n in counts.items():
        print(f"{name:<22} {n:>8,} rows")
    print(f"Written to {args.out.resolve()}")


if __name__ == "__main__":
    main()
