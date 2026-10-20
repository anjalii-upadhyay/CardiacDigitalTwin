"""Score a new chest-patch recording with the frozen congestion model."""

from hf_twin.inference.predict import load_model, predict_recording, predict_wedge

__all__ = ["load_model", "predict_wedge", "predict_recording"]
