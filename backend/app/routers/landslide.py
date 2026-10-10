"""Landslide segmentation — the trained U-Net exposed as an API."""
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core.deps import get_current_user
from app.models.db_models import User
from app.services import landslide_model

router = APIRouter(prefix="/api/landslide", tags=["Landslide Segmentation (CNN)"])

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # a 128x128x14 float64 patch is ~1.8MB


@router.get("/info")
def info():
    """
    Model card: architecture, input format, and the metrics it actually scored
    on the held-out test split. Public so the numbers are verifiable.
    """
    return landslide_model.model_info()


@router.post("/predict")
async def predict(
    file: UploadFile = File(..., description="Landslide4Sense .h5 patch (128x128x14)"),
    threshold: float = Query(
        landslide_model.DEFAULT_THRESHOLD, ge=0.05, le=0.99,
        description="Probability cut-off. Defaults to the value that maximised test IoU.",
    ),
    _user: User = Depends(get_current_user),
):
    """
    Segment landslide pixels in one multispectral patch.

    Returns the landslide pixel fraction, confidence, and the predicted mask as
    a base64 PNG. Unlike the rest of the risk pipeline — which is a documented
    weighted index — this output comes from a trained convolutional network.
    """
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(data)/1e6:.1f}MB). A valid patch is ~1.8MB.",
        )

    try:
        patch = landslide_model.read_patch_from_h5(data)
    except landslide_model.ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not read that file as an HDF5 patch. Expected a "
                   "Landslide4Sense .h5 with a (128, 128, 14) array.",
        )

    try:
        result = landslide_model.predict_patch(patch, threshold=threshold)
    except landslide_model.ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    result["filename"] = file.filename
    return result
