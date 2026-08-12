# Deep learning — landslide segmentation (U-Net)

Trains a U-Net to segment landslide pixels from Sentinel-2 satellite imagery,
then exports it to ONNX so the StrataWatch backend can serve it.

This is the deep-learning component of the project. Everything else in the repo
(risk fusion, the insight engine) is classical statistics, and is documented as
such — see the main README.

---

## 1. The dataset

**Landslide4Sense** — download from Kaggle (~3.6 GB):

> https://www.kaggle.com/datasets/tekbahadurkshetri/landslide4sense

| | |
|---|---|
| Patches | 3,799 labelled (in `TrainData`) |
| Size | 128 × 128 pixels |
| Channels | **14** — Sentinel-2 B1–B12, plus DEM and slope |
| Label | Binary mask, 1 = landslide pixel |
| Format | HDF5 (`.h5`), keys `img` and `mask` |

After extracting you need this layout:

```
TrainData/
├── img/    image_1.h5, image_2.h5, ...
└── mask/   mask_1.h5,  mask_2.h5,  ...
```

### One thing to know before you start

The download also ships `ValidData/` and `TestData/`, but **those contain images
only — no masks.** They were the competition's held-out sets. So they cannot be
used to measure anything.

This pipeline therefore splits `TrainData` itself into **70% train / 15% val /
15% test** with a fixed seed (42). The test split is never seen during training
or model selection, so the numbers it produces are honest. Say this explicitly
in your report — it's the kind of detail that shows you understood the data
rather than just running a script.

---

## 2. Train (use Colab — free GPU)

```python
# Colab cell 1 — setup
!pip install h5py onnx onnxscript onnxruntime -q
!git clone https://github.com/Tiru1505/Rockfall_Prediction.git
%cd Rockfall_Prediction/training
```

Upload and unzip the dataset (or mount Drive), then:

```python
# Colab cell 2 — train
!python train.py --data-root /content/TrainData --epochs 40 --batch-size 16
```

On a free Colab T4 this takes roughly **30–50 minutes** for 40 epochs. On CPU it
takes hours — don't.

**Watch validation IoU, not loss.** The checkpoint is saved on best val IoU
because loss can keep falling while the model quietly gets worse at the only
thing that matters.

## 3. Evaluate

```python
!python evaluate.py --data-root /content/TrainData --checkpoint runs/unet/best.pt
```

Prints IoU, F1, precision and recall on the held-out test split, plus a
threshold sweep. Results are written to `runs/unet/test_metrics.json`.

## 4. Export for the backend

```python
!python export_onnx.py --checkpoint runs/unet/best.pt --output landslide_unet.onnx
```

Verifies the ONNX output matches PyTorch before finishing. Download the `.onnx`
file — it's a few MB and can be committed to the repo.

---

## The actual DL content, for your report

This dataset has a property that makes it a real problem rather than a
tutorial: **only ~2.3% of pixels are landslide.**

That single fact drives every design decision here, and it's what you should
write about:

**Why accuracy is a trap.** A model that predicts "background" everywhere scores
about **97.7% pixel accuracy** and detects nothing. `evaluate.py` prints this
deliberately, next to the real metrics, so you can show the comparison.

**What we use instead** — IoU (Jaccard) and F1 on the positive class only. An
all-background prediction scores IoU 0. Verified in the test suite.

**Loss function.** `DiceBCELoss` = 0.5 × weighted BCE + 0.5 × Dice.
- BCE alone collapses to the majority class
- Dice is computed on overlap, so it can't be gamed that way
- BCE additionally gets `pos_weight ≈ negatives/positives ≈ 42`, computed from
  the training split at runtime
- `FocalLoss` is also implemented if you want to compare — a good ablation

**Architecture.** U-Net: 4 downsampling stages (128 → 8), a bottleneck, 4
upsampling stages with skip connections. About **7.8M parameters** at the
default `base=32`. Skips are the point — without them the decoder only sees
heavily downsampled features and landslide boundaries come out blurred.

**No transfer learning.** Input is 14 channels, not RGB, so ImageNet weights
don't apply. Trained from scratch, which is fine at this resolution and dataset
size. Worth a sentence — it's a real consequence of using multispectral data.

**Augmentation.** Flips and 90° rotations only. Satellite imagery is
orientation-agnostic so these are label-preserving; colour jitter would corrupt
the physical meaning of reflectance bands.

**Normalisation.** Per-band mean/std computed **from the training split only**
(computing over everything leaks distribution into the model). Necessary because
the bands are on wildly different scales — reflectance is ~0–3 while elevation
is in metres.

### Numbers to expect

Published Landslide4Sense baselines land around **F1 0.70–0.75**. If you get
**IoU 0.50–0.65 / F1 0.65–0.75** on the test split, that's a solid result.

If you see IoU near 0.95, something is wrong — most likely the same patch
appearing in both train and test.

### Good ablations, if you want more depth

1. Dice+BCE vs. focal vs. plain BCE — shows the collapse directly
2. All 14 bands vs. RGB only vs. no DEM/slope — quantifies what the terrain
   bands contribute
3. With and without augmentation
4. `base=16` vs `32` vs `64` — capacity against overfitting

Each is a one-flag change and a row in a results table.

---

## Files

| File | Purpose |
|---|---|
| `dataset.py` | `.h5` loader, train/val/test split, band normalisation, augmentation |
| `model.py` | U-Net implementation |
| `losses.py` | Dice, focal, Dice+BCE; IoU/F1/precision/recall |
| `train.py` | Training loop, checkpointing on best val IoU |
| `evaluate.py` | Held-out test metrics and threshold sweep |
| `export_onnx.py` | ONNX export with correctness check |

## Integrating into the backend

Once you have `landslide_unet.onnx`:

1. `pip install onnxruntime` and add it to `backend/requirements.txt`
2. Put the model in `backend/app/models_ml/`
3. Add a service that loads it lazily with `onnxruntime.InferenceSession` and a
   route that accepts a patch and returns the predicted mask plus the landslide
   pixel fraction

**Do not install PyTorch on the backend.** It's ~800MB and would exceed Render's
512MB free tier on import. That's why the export step exists — onnxruntime is
~15MB and runs this model on CPU in tens of milliseconds.
