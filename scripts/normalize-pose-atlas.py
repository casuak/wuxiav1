#!/usr/bin/env python3
"""Normalize a generated 2x2 pose sheet into a Phaser-friendly RGBA atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


GRID_SIZE = 2
CELL_SIZE = 512
CONTENT_LIMIT = 452
ALPHA_FLOOR = 12


def normalize(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    source_width, source_height = image.size
    cells: list[Image.Image] = []
    bounds: list[tuple[int, int, int, int] | None] = []

    for index in range(GRID_SIZE * GRID_SIZE):
        column = index % GRID_SIZE
        row = index // GRID_SIZE
        cell = image.crop(
            (
                round(column * source_width / GRID_SIZE),
                round(row * source_height / GRID_SIZE),
                round((column + 1) * source_width / GRID_SIZE),
                round((row + 1) * source_height / GRID_SIZE),
            ),
        )
        red, green, blue, alpha = cell.split()
        alpha = alpha.point(lambda value: 0 if value < ALPHA_FLOOR else value)
        cell = Image.merge("RGBA", (red, green, blue, alpha))
        cells.append(cell)
        bounds.append(alpha.getbbox())

    populated = [box for box in bounds if box is not None]
    if len(populated) != GRID_SIZE * GRID_SIZE:
        raise ValueError("Every pose quadrant must contain visible pixels")
    max_width = max(box[2] - box[0] for box in populated)
    max_height = max(box[3] - box[1] for box in populated)
    scale = min(CONTENT_LIMIT / max_width, CONTENT_LIMIT / max_height)

    output = Image.new(
        "RGBA",
        (CELL_SIZE * GRID_SIZE, CELL_SIZE * GRID_SIZE),
        (0, 0, 0, 0),
    )
    for index, (cell, box) in enumerate(zip(cells, bounds, strict=True)):
        if box is None:
            continue
        content = cell.crop(box)
        resized = content.resize(
            (
                max(1, round(content.width * scale)),
                max(1, round(content.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )
        column = index % GRID_SIZE
        row = index // GRID_SIZE
        target_x = column * CELL_SIZE + (CELL_SIZE - resized.width) // 2
        target_y = row * CELL_SIZE + (CELL_SIZE - resized.height) // 2
        output.alpha_composite(resized, (target_x, target_y))

    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    normalize(args.source, args.destination)


if __name__ == "__main__":
    main()
