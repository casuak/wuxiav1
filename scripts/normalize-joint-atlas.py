#!/usr/bin/env python3
"""Normalize a generated 4x4 joint sheet into a Phaser-friendly RGBA atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CELL_SIZE = 256
GRID_SIZE = 4
ALPHA_FLOOR = 56
CONTENT_LIMIT = 220


def grid_boundaries(alpha: Image.Image, axis: str) -> list[int]:
    length = alpha.width if axis == "x" else alpha.height
    breadth = alpha.height if axis == "x" else alpha.width
    boundaries = [0]
    for division in range(1, GRID_SIZE):
        nominal = round(division * length / GRID_SIZE)
        radius = round(length * 0.13)
        start = max(boundaries[-1] + 8, nominal - radius)
        end = min(length - 8, nominal + radius)
        empty: list[int] = []
        for coordinate in range(start, end):
            strip = (
                alpha.crop((coordinate, 0, coordinate + 1, breadth))
                if axis == "x"
                else alpha.crop((0, coordinate, breadth, coordinate + 1))
            )
            if strip.getbbox() is None:
                empty.append(coordinate)

        runs: list[list[int]] = []
        for coordinate in empty:
            if not runs or coordinate != runs[-1][-1] + 1:
                runs.append([coordinate])
            else:
                runs[-1].append(coordinate)
        if runs:
            best = min(
                runs,
                key=lambda run: (
                    -len(run),
                    abs((run[0] + run[-1]) / 2 - nominal),
                ),
            )
            boundaries.append(round((best[0] + best[-1]) / 2))
        else:
            boundaries.append(nominal)
    boundaries.append(length)
    return boundaries


def normalize(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    output = Image.new("RGBA", (CELL_SIZE * GRID_SIZE, CELL_SIZE * GRID_SIZE), (0, 0, 0, 0))
    source_alpha = image.getchannel("A").point(lambda value: 0 if value < ALPHA_FLOOR else 255)
    x_bounds = grid_boundaries(source_alpha, "x")
    y_bounds = grid_boundaries(source_alpha, "y")

    for index in range(GRID_SIZE * GRID_SIZE):
        column = index % GRID_SIZE
        row = index // GRID_SIZE
        bounds = (
            x_bounds[column],
            y_bounds[row],
            x_bounds[column + 1],
            y_bounds[row + 1],
        )
        cell = image.crop(bounds)
        red, green, blue, alpha = cell.split()
        alpha = alpha.point(lambda value: 0 if value < ALPHA_FLOOR else value)
        cell = Image.merge("RGBA", (red, green, blue, alpha))
        content_bounds = alpha.getbbox()
        if content_bounds is None:
            continue

        content = cell.crop(content_bounds)
        scale = min(CONTENT_LIMIT / content.width, CONTENT_LIMIT / content.height)
        resized = content.resize(
            (max(1, round(content.width * scale)), max(1, round(content.height * scale))),
            Image.Resampling.LANCZOS,
        )
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
