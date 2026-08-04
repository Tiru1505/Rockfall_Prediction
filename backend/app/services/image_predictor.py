"""
Image-based slope-risk predictor.

IMPORTANT: No trained CNN ships with this prototype (no labeled slope/drone
image dataset was available). This module implements a clearly-marked
placeholder heuristic so the full pipeline (upload -> risk -> fusion -> alert)
is genuinely wired end-to-end and testable today.

To go to production:
  1. Collect/label a slope-image dataset (Stable / Moderate / High / Dangerous).
  2. Fine-tune EfficientNetB0 (see /training/train_image_model.py) on it.
  3. Replace `predict()` below with:
        model = tf.keras.models.load_model("models/efficientnet_rockfall.h5")
        preds = model.predict(preprocess(image))
     keeping the same return shape so no other code needs to change.
  4. Add Grad-CAM (see /training/gradcam.py stub) and return a real heatmap
     image instead of `gradcam_note`.
"""
import hashlib
from io import BytesIO
from PIL import Image, ImageStat
import numpy as np

CLASSES = ["Stable", "Moderate Risk", "High Risk", "Dangerous"]


def _deterministic_seed(image_bytes: bytes) -> int:
    return int(hashlib.sha256(image_bytes).hexdigest(), 16) % (2 ** 32)


def predict(image_bytes: bytes, filename: str) -> dict:
    """
    Heuristic placeholder "prediction":
    Uses real pixel statistics (brightness, contrast/texture) as a rough,
    deterministic proxy for slope roughness/shadowing, combined with a
    per-image seed so results are stable across repeated calls on the same
    image (not random each time) — while clearly NOT a trained model.
    """
    try:
        img = Image.open(BytesIO(image_bytes)).convert("L").resize((224, 224))
    except Exception:
        # Not a decodable image - fall back to a neutral, low-confidence result
        return {
            "image_risk": 25.0,
            "confidence": 0.30,
            "predicted_class": "Stable",
            "gradcam_note": "No Grad-CAM available: file could not be decoded as an image.",
        }

    stat = ImageStat.Stat(img)
    brightness = stat.mean[0]           # 0-255
    contrast = stat.stddev[0]           # texture/roughness proxy

    seed = _deterministic_seed(image_bytes)
    rng = np.random.default_rng(seed)
    noise = rng.uniform(-5, 5)

    # Darker + higher-contrast images are treated as "rougher/shadowed slopes" -> higher heuristic risk
    darkness_score = max(0, (160 - brightness)) / 160 * 100
    texture_score = min(contrast / 70, 1.0) * 100

    image_risk = float(np.clip(0.5 * darkness_score + 0.5 * texture_score + noise, 0, 100))
    confidence = float(np.clip(0.55 + (contrast / 255), 0.5, 0.93))

    class_idx = min(int(image_risk // 25), 3)
    predicted_class = CLASSES[class_idx]

    return {
        "image_risk": round(image_risk, 2),
        "confidence": round(confidence, 2),
        "predicted_class": predicted_class,
        "gradcam_note": (
            "Placeholder result (heuristic pixel-statistics model, not a trained CNN). "
            "Swap in a fine-tuned EfficientNetB0 + Grad-CAM per the module docstring "
            "to get real slope-image predictions and heatmaps."
        ),
    }
