"""
Losses and metrics for a heavily imbalanced segmentation task.

Only ~2.3% of pixels in Landslide4Sense are landslide. That single fact drives
every choice in this file:

  * Plain BCE lets the model reach ~97.7% pixel accuracy by predicting
    "background" everywhere. It looks excellent and detects nothing.
  * Dice loss is computed on the overlap between predicted and true positive
    regions, so an all-background prediction scores zero. It cannot be gamed
    the same way.
  * Accuracy is not reported at all. IoU (Jaccard) and F1 on the positive class
    are the honest metrics here.

The default loss is BCE + Dice: BCE gives dense, well-behaved gradients early in
training, Dice pushes the model to actually cover the positive region.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

EPS = 1e-6


class DiceLoss(nn.Module):
    """1 - Dice coefficient, computed on sigmoid probabilities (soft Dice)."""

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = torch.sigmoid(logits)
        num = 2.0 * (probs * targets).sum(dim=(1, 2, 3)) + EPS
        den = probs.sum(dim=(1, 2, 3)) + targets.sum(dim=(1, 2, 3)) + EPS
        return 1.0 - (num / den).mean()


class FocalLoss(nn.Module):
    """
    Down-weights easy, confidently-correct pixels so the loss is dominated by
    the hard ones. An alternative to Dice when the imbalance is extreme.
    """

    def __init__(self, alpha: float = 0.25, gamma: float = 2.0):
        super().__init__()
        self.alpha, self.gamma = alpha, gamma

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        bce = F.binary_cross_entropy_with_logits(logits, targets, reduction="none")
        p_t = torch.exp(-bce)                       # probability of the true class
        alpha_t = self.alpha * targets + (1 - self.alpha) * (1 - targets)
        return (alpha_t * (1 - p_t) ** self.gamma * bce).mean()


class DiceBCELoss(nn.Module):
    """
    Default. `pos_weight` additionally scales up positive-pixel errors inside
    the BCE term; pass roughly (negatives / positives) from the training set.
    """

    def __init__(self, bce_weight: float = 0.5, pos_weight: float | None = None):
        super().__init__()
        self.bce_weight = bce_weight
        self.dice = DiceLoss()
        self.register_buffer(
            "pos_weight",
            torch.tensor(pos_weight) if pos_weight is not None else None,
        )

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        bce = F.binary_cross_entropy_with_logits(
            logits, targets,
            pos_weight=self.pos_weight.to(logits.device) if self.pos_weight is not None else None,
        )
        return self.bce_weight * bce + (1 - self.bce_weight) * self.dice(logits, targets)


@torch.no_grad()
def segmentation_metrics(logits: torch.Tensor, targets: torch.Tensor, threshold: float = 0.5) -> dict:
    """
    IoU, F1/Dice, precision and recall for the positive (landslide) class,
    accumulated over the whole batch rather than averaged per-image — a patch
    with no landslide at all would otherwise contribute a meaningless 0 or 1.
    """
    preds = (torch.sigmoid(logits) > threshold).float()

    tp = (preds * targets).sum()
    fp = (preds * (1 - targets)).sum()
    fn = ((1 - preds) * targets).sum()

    precision = tp / (tp + fp + EPS)
    recall = tp / (tp + fn + EPS)
    f1 = 2 * precision * recall / (precision + recall + EPS)
    iou = tp / (tp + fp + fn + EPS)

    return {
        "iou": iou.item(),
        "f1": f1.item(),
        "precision": precision.item(),
        "recall": recall.item(),
        "tp": tp.item(), "fp": fp.item(), "fn": fn.item(),
    }


class MetricAccumulator:
    """Sums TP/FP/FN across batches so epoch metrics are computed on totals."""

    def __init__(self):
        self.tp = self.fp = self.fn = 0.0

    def update(self, logits: torch.Tensor, targets: torch.Tensor, threshold: float = 0.5) -> None:
        m = segmentation_metrics(logits, targets, threshold)
        self.tp += m["tp"]
        self.fp += m["fp"]
        self.fn += m["fn"]

    def compute(self) -> dict:
        precision = self.tp / (self.tp + self.fp + EPS)
        recall = self.tp / (self.tp + self.fn + EPS)
        return {
            "iou": self.tp / (self.tp + self.fp + self.fn + EPS),
            "f1": 2 * precision * recall / (precision + recall + EPS),
            "precision": precision,
            "recall": recall,
        }
