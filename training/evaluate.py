"""
Evaluate a trained checkpoint on the held-out test split.

    python evaluate.py --data-root "path/to/TrainData" --checkpoint runs/unet/best.pt

Reports IoU, F1, precision and recall — the numbers to put in your report — plus
a threshold sweep, because 0.5 is rarely the best operating point on imbalanced
data and choosing it deliberately is worth a paragraph in the write-up.

Pixel accuracy is printed once, only to show why it must not be used: it sits
near 97% even for a model that finds almost nothing.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from dataset import Landslide4SenseDataset, list_pairs, split_pairs
from losses import MetricAccumulator
from model import UNet


@torch.no_grad()
def collect_logits(model, loader, device):
    all_logits, all_masks = [], []
    for images, masks in loader:
        all_logits.append(model(images.to(device)).cpu())
        all_masks.append(masks)
    return torch.cat(all_logits), torch.cat(all_masks)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data-root", required=True)
    p.add_argument("--checkpoint", default="runs/unet/best.pt")
    p.add_argument("--out-dir", default="runs/unet")
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--val-frac", type=float, default=0.15)
    p.add_argument("--test-frac", type=float, default=0.15)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    out_dir = Path(args.out_dir)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    ckpt = torch.load(args.checkpoint, map_location=device)
    model = UNet(14, 1, base=ckpt.get("base_channels", 32)).to(device)
    model.load_state_dict(ckpt["model"])
    model.eval()
    print(f"loaded {args.checkpoint} (epoch {ckpt['epoch']}, val IoU {ckpt['val_iou']:.4f})")

    # Same seed and fractions as training, so this really is the unseen split.
    pairs = list_pairs(Path(args.data_root))
    _, _, test_pairs = split_pairs(pairs, args.val_frac, args.test_frac, args.seed)
    stats = json.loads((out_dir / "band_stats.json").read_text())

    loader = DataLoader(
        Landslide4SenseDataset(test_pairs, stats, augment=False),
        batch_size=args.batch_size, shuffle=False,
    )
    print(f"test patches: {len(test_pairs)}")

    logits, masks = collect_logits(model, loader, device)

    acc = MetricAccumulator()
    acc.update(logits, masks, threshold=0.5)
    m = acc.compute()

    preds = (torch.sigmoid(logits) > 0.5).float()
    pixel_acc = (preds == masks).float().mean().item()

    print("\n--- test set, threshold 0.5 ---")
    print(f"  IoU (Jaccard) : {m['iou']:.4f}")
    print(f"  F1 / Dice     : {m['f1']:.4f}")
    print(f"  Precision     : {m['precision']:.4f}")
    print(f"  Recall        : {m['recall']:.4f}")
    print(f"  Pixel accuracy: {pixel_acc:.4f}   <- do NOT report this as the headline")
    print(f"                    (predicting all-background alone scores "
          f"{1 - masks.mean().item():.4f})")

    print("\n--- threshold sweep ---")
    print(f"  {'thr':>5}  {'IoU':>7}  {'F1':>7}  {'prec':>7}  {'recall':>7}")
    sweep = []
    for thr in np.arange(0.1, 0.91, 0.1):
        a = MetricAccumulator()
        a.update(logits, masks, threshold=float(thr))
        s = a.compute()
        sweep.append({"threshold": round(float(thr), 2), **s})
        print(f"  {thr:5.1f}  {s['iou']:7.4f}  {s['f1']:7.4f}  "
              f"{s['precision']:7.4f}  {s['recall']:7.4f}")

    best = max(sweep, key=lambda s: s["iou"])
    print(f"\nbest IoU {best['iou']:.4f} at threshold {best['threshold']}")

    (out_dir / "test_metrics.json").write_text(json.dumps(
        {"threshold_0.5": m, "pixel_accuracy": pixel_acc,
         "sweep": sweep, "best": best, "test_patches": len(test_pairs)},
        indent=2,
    ))
    print(f"written: {out_dir / 'test_metrics.json'}")


if __name__ == "__main__":
    main()
