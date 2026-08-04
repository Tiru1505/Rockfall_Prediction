from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.db_models import User, Prediction, Alert
from app.schemas.schemas import UserOut

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    return [UserOut.model_validate(u) for u in db.query(User).all()]


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "deleted", "user_id": user_id}


@router.delete("/predictions/{prediction_id}")
def delete_prediction(prediction_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    pred = db.query(Prediction).filter(Prediction.id == prediction_id).first()
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    db.delete(pred)
    db.commit()
    return {"status": "deleted", "prediction_id": prediction_id}


@router.get("/stats")
def admin_stats(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    return {
        "total_users": db.query(User).count(),
        "total_predictions": db.query(Prediction).count(),
        "total_alerts": db.query(Alert).count(),
    }
