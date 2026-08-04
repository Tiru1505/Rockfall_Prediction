"""
Drill mode — deliberately drive a site's risk to a target so the alert and
escalation path can be demonstrated.

WHY THIS EXISTS: with no slope image uploaded, `image_risk` is pinned at the
neutral 30 default, so the fused ceiling is roughly
    0.40*30 + 0.35*100 + 0.25*35  ~= 56%
The 80% alert threshold is therefore unreachable from the simulated feed, and
the alerting path could never be shown working.

EVERYTHING A DRILL PRODUCES IS FLAGGED. Predictions and alerts created while a
drill is running carry `simulated = 1`, alert text is prefixed `[DRILL]`, and
the UI badges them. A forced alert that looked identical to a real one would
corrupt the incident record of a safety-warning system, so this is deliberate,
not decoration. `purge_simulated()` removes drill data once a demo is over.

State is in-process: a drill is ephemeral by nature, and a restart cancelling
one is the safe failure direction.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone

MIN_TARGET = 5.0
MAX_TARGET = 99.0
MAX_TICKS = 60

# Component spread applied around the target so the breakdown looks like a real
# reading with a dominant driver rather than three identical numbers. The
# offsets are weighted to cancel out (0.40*-6 + 0.35*+8 + 0.25*-2.4 = -0.2), so
# the fused score still lands on the requested target.
_IMAGE_OFFSET = -6.0
_SENSOR_OFFSET = +8.0
_WEATHER_OFFSET = -2.4


@dataclass
class Drill:
    site_id: str
    target_risk: float
    mode: str               # "instant" | "ramp"
    total_steps: int        # evaluations the ramp is spread over
    start_risk: float       # risk when the drill began, for interpolation
    steps_done: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def finished(self) -> bool:
        # A ramp holds at the target for one extra step so the alert is visible
        # on the chart rather than flashing past in a single reading.
        return self.steps_done > self.total_steps

    def current_target(self) -> float:
        """
        Risk this evaluation should produce.

        Progress counts from the first step, not zero: starting at zero would
        make the opening reading reproduce the site's existing risk, so kicking
        off a drill would look like nothing happened.
        """
        if self.mode == "instant" or self.total_steps <= 0:
            return self.target_risk
        progress = min((self.steps_done + 1) / self.total_steps, 1.0)
        return self.start_risk + (self.target_risk - self.start_risk) * progress

    def as_dict(self) -> dict:
        return {
            "site_id": self.site_id,
            "target_risk": round(self.target_risk, 2),
            "mode": self.mode,
            "total_steps": self.total_steps,
            "steps_done": self.steps_done,
            "start_risk": round(self.start_risk, 2),
            "next_target": round(self.current_target(), 2),
            "started_at": self.started_at.isoformat(),
            "finished": self.finished,
        }


_drills: dict[str, Drill] = {}


def start(site_id: str, target_risk: float, mode: str, steps: int, current_risk: float) -> Drill:
    target = max(MIN_TARGET, min(MAX_TARGET, float(target_risk)))
    mode = "instant" if mode == "instant" else "ramp"
    steps = max(1, min(MAX_TICKS, int(steps)))

    drill = Drill(
        site_id=site_id,
        target_risk=target,
        mode=mode,
        total_steps=0 if mode == "instant" else steps,
        start_risk=float(current_risk or 0.0),
    )
    _drills[site_id] = drill
    return drill


def cancel(site_id: str) -> bool:
    return _drills.pop(site_id, None) is not None


def cancel_all() -> int:
    count = len(_drills)
    _drills.clear()
    return count


def active(site_id: str) -> Drill | None:
    return _drills.get(site_id)


def all_active() -> list[dict]:
    return [d.as_dict() for d in _drills.values()]


def consume(site_id: str) -> float | None:
    """
    Called once per evaluation. Returns the risk this reading should be forced
    to, advancing the ramp, or None when no drill is running. Retires the drill
    on its final step so risk falls back to the real feed afterwards.
    """
    drill = _drills.get(site_id)
    if drill is None:
        return None

    target = drill.current_target()
    drill.steps_done += 1

    if drill.finished:
        _drills.pop(site_id, None)

    return target


def components_for(target: float) -> dict:
    """
    Split a target score into image/sensor/weather components whose weighted sum
    is the target, biased so sensors read as the dominant driver — which is what
    a real geotechnical escalation looks like.
    """
    def clamp(v: float) -> float:
        return round(max(0.0, min(100.0, v)), 2)

    return {
        "image_risk": clamp(target + _IMAGE_OFFSET),
        "sensor_risk": clamp(target + _SENSOR_OFFSET),
        "weather_risk": clamp(target + _WEATHER_OFFSET),
    }
