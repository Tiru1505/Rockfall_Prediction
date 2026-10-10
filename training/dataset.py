"""
Landslide4Sense dataset loader.

Each sample is a 128x128 patch with 14 channels (0-indexed here; the official
Landslide4Sense description numbers them B1-B14):
    0-11  Sentinel-2 surface reflectance bands (B1-B12)
    12    Slope, from ALOS PALSAR          (B13)
    13    DEM / elevation, from ALOS PALSAR (B14)

The mask is 128x128, binary: 1 = landslide pixel, 0 = background.

IMPORTANT — the official split is unusable for supervised training as shipped:
only `TrainData` has masks. `ValidData` and `TestData` are the competition's
held-out sets and contain images only. So we split `TrainData` ourselves into
train/val/test with a fixed seed. That is stated plainly here because reporting
"test IoU" on a set the model tuned against would be meaningless.
"""
from __future__ import annotations

import json
from pathlib import Path

import h5py
import numpy as np
import torch
from torch.utils.data import Dataset

N_CHANNELS = 14
PATCH = 128


def list_pairs(root: Path) -> list[tuple[Path, Path]]:
    """Match image_N.h5 to mask_N.h5, skipping any image without a mask."""
    img_dir, mask_dir = root / "img", root / "mask"
    pairs = []
    for img_path in sorted(img_dir.glob("image_*.h5")):
        mask_path = mask_dir / img_path.name.replace("image_", "mask_")
        if mask_path.exists():
            pairs.append((img_path, mask_path))
    if not pairs:
        raise FileNotFoundError(
            f"No image/mask pairs under {root}. Expected {root}/img/image_*.h5 "
            f"and {root}/mask/mask_*.h5"
        )
    return pairs


def split_pairs(pairs, val_frac=0.15, test_frac=0.15, seed=42):
    """Deterministic train/val/test split of the labelled set."""
    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(pairs))
    n_test = int(len(pairs) * test_frac)
    n_val = int(len(pairs) * val_frac)
    test_idx, val_idx, train_idx = idx[:n_test], idx[n_test:n_test + n_val], idx[n_test + n_val:]
    take = lambda ids: [pairs[i] for i in ids]
    return take(train_idx), take(val_idx), take(test_idx)


def read_image(path: Path) -> np.ndarray:
    with h5py.File(path, "r") as f:
        arr = f["img"][:]
    # The published data contains NaNs in some bands; left in place they poison
    # every downstream gradient with NaN.
    return np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)


def read_mask(path: Path) -> np.ndarray:
    with h5py.File(path, "r") as f:
        arr = f["mask"][:]
    return (np.nan_to_num(arr, nan=0.0) > 0.5).astype(np.float32)


def compute_band_stats(pairs, cache: Path, max_samples: int = 800) -> dict:
    """
    Per-band mean/std over a sample of the training set, cached to JSON.

    Bands are on wildly different scales (reflectance ~0-3, elevation in metres),
    so feeding them raw makes the optimiser chase whichever band happens to have
    the largest magnitude.
    """
    if cache.exists():
        return json.loads(cache.read_text())

    rng = np.random.default_rng(0)
    sample = [pairs[i] for i in rng.permutation(len(pairs))[:max_samples]]

    # Welford would be tidier, but n is small enough that two passes over a
    # sample is simpler to read and plenty accurate.
    total = np.zeros(N_CHANNELS, dtype=np.float64)
    total_sq = np.zeros(N_CHANNELS, dtype=np.float64)
    count = 0
    for img_path, _ in sample:
        arr = read_image(img_path).reshape(-1, N_CHANNELS)
        total += arr.sum(axis=0)
        total_sq += (arr.astype(np.float64) ** 2).sum(axis=0)
        count += arr.shape[0]

    mean = total / count
    var = np.maximum(total_sq / count - mean ** 2, 1e-8)
    stats = {"mean": mean.tolist(), "std": np.sqrt(var).tolist()}

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(stats, indent=2))
    return stats


class Landslide4SenseDataset(Dataset):
    def __init__(self, pairs, stats: dict, augment: bool = False):
        self.pairs = pairs
        self.mean = np.array(stats["mean"], dtype=np.float32).reshape(N_CHANNELS, 1, 1)
        self.std = np.array(stats["std"], dtype=np.float32).reshape(N_CHANNELS, 1, 1)
        self.augment = augment

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, i):
        img_path, mask_path = self.pairs[i]

        img = read_image(img_path).transpose(2, 0, 1)   # HWC -> CHW
        mask = read_mask(mask_path)[None, ...]           # 1HW

        if self.augment:
            # Flips and 90-degree rotations only. Satellite imagery is
            # orientation-agnostic, so these are label-preserving; colour jitter
            # or shearing would corrupt the physical meaning of the bands.
            if np.random.rand() < 0.5:
                img, mask = img[:, :, ::-1], mask[:, :, ::-1]
            if np.random.rand() < 0.5:
                img, mask = img[:, ::-1, :], mask[:, ::-1, :]
            k = np.random.randint(4)
            if k:
                img, mask = np.rot90(img, k, (1, 2)), np.rot90(mask, k, (1, 2))
            img, mask = np.ascontiguousarray(img), np.ascontiguousarray(mask)

        img = (img - self.mean) / self.std
        return torch.from_numpy(img).float(), torch.from_numpy(mask.copy()).float()


def positive_pixel_fraction(pairs, max_samples: int = 500) -> float:
    """Class balance, for choosing loss weighting and for the report."""
    rng = np.random.default_rng(0)
    sample = [pairs[i] for i in rng.permutation(len(pairs))[:max_samples]]
    return float(np.mean([read_mask(m).mean() for _, m in sample]))
