"""
Train the U-Net on Landslide4Sense.

    python train.py --data-root "path/to/TrainData" --epochs 40

Checkpoints the best model by **validation IoU**, not by loss — loss can drift
down while the model quietly gets worse at the only thing that matters here.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from dataset import (
    Landslide4SenseDataset, compute_band_stats, list_pairs,
    positive_pixel_fraction, split_pairs,
)
from losses import DiceBCELoss, MetricAccumulator
from model import UNet, count_parameters


def build_loaders(args, out_dir: Path):
    pairs = list_pairs(Path(args.data_root))
    train_pairs, val_pairs, test_pairs = split_pairs(
        pairs, args.val_frac, args.test_frac, args.seed
    )

    # Stats come from the training split only. Computing them over everything
    # would leak validation/test distribution into the normalisation.
    stats = compute_band_stats(train_pairs, out_dir / "band_stats.json")

    loaders = {
        "train": DataLoader(
            Landslide4SenseDataset(train_pairs, stats, augment=True),
            batch_size=args.batch_size, shuffle=True,
            num_workers=args.workers, pin_memory=True, drop_last=True,
        ),
        "val": DataLoader(
            Landslide4SenseDataset(val_pairs, stats, augment=False),
            batch_size=args.batch_size, shuffle=False, num_workers=args.workers,
        ),
    }
    split_sizes = {"train": len(train_pairs), "val": len(val_pairs), "test": len(test_pairs)}

    # Persist the split so evaluate.py scores the same held-out patches.
    (out_dir / "split.json").write_text(json.dumps({
        k: [str(p[0].name) for p in v]
        for k, v in {"train": train_pairs, "val": val_pairs, "test": test_pairs}.items()
    }, indent=2))

    return loaders, split_sizes, train_pairs


def run_epoch(model, loader, criterion, optimizer, device, train: bool):
    model.train(train)
    acc = MetricAccumulator()
    total_loss, n_batches = 0.0, 0

    for images, masks in loader:
        images, masks = images.to(device, non_blocking=True), masks.to(device, non_blocking=True)

        with torch.set_grad_enabled(train):
            logits = model(images)
            loss = criterion(logits, masks)
            if train:
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()

        total_loss += loss.item()
        n_batches += 1
        acc.update(logits.detach(), masks)

    metrics = acc.compute()
    metrics["loss"] = total_loss / max(n_batches, 1)
    return metrics


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data-root", required=True, help="Folder containing img/ and mask/")
    p.add_argument("--out-dir", default="runs/unet")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--base-channels", type=int, default=32)
    p.add_argument("--val-frac", type=float, default=0.15)
    p.add_argument("--test-frac", type=float, default=0.15)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    torch.manual_seed(args.seed)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")
    if device.type == "cpu":
        print("  WARNING: no GPU found. Training on CPU will take hours — use Colab.")

    loaders, sizes, train_pairs = build_loaders(args, out_dir)
    print(f"patches -> train {sizes['train']}  val {sizes['val']}  test {sizes['test']}")

    pos_frac = positive_pixel_fraction(train_pairs)
    pos_weight = (1 - pos_frac) / max(pos_frac, 1e-6)
    print(f"positive pixels: {pos_frac * 100:.2f}%  ->  BCE pos_weight {pos_weight:.1f}")

    model = UNet(in_channels=14, out_channels=1, base=args.base_channels).to(device)
    print(f"U-Net parameters: {count_parameters(model):,}")

    criterion = DiceBCELoss(bce_weight=0.5, pos_weight=pos_weight).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", factor=0.5, patience=4
    )

    best_iou, history = -1.0, []
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        tr = run_epoch(model, loaders["train"], criterion, optimizer, device, train=True)
        va = run_epoch(model, loaders["val"], criterion, optimizer, device, train=False)
        scheduler.step(va["iou"])

        history.append({"epoch": epoch, "train": tr, "val": va})
        print(
            f"epoch {epoch:3d}/{args.epochs}  "
            f"loss {tr['loss']:.4f}/{va['loss']:.4f}  "
            f"IoU {tr['iou']:.4f}/{va['iou']:.4f}  "
            f"F1 {va['f1']:.4f}  P {va['precision']:.3f}  R {va['recall']:.3f}  "
            f"({time.time() - t0:.0f}s)"
        )

        if va["iou"] > best_iou:
            best_iou = va["iou"]
            torch.save({
                "model": model.state_dict(),
                "epoch": epoch,
                "val_iou": best_iou,
                "base_channels": args.base_channels,
            }, out_dir / "best.pt")
            print(f"          saved new best (val IoU {best_iou:.4f})")

        (out_dir / "history.json").write_text(json.dumps(history, indent=2))

    print(f"\nbest validation IoU: {best_iou:.4f}")
    print(f"checkpoint: {out_dir / 'best.pt'}")
    print("next: python evaluate.py --data-root ... --checkpoint runs/unet/best.pt")


if __name__ == "__main__":
    main()
