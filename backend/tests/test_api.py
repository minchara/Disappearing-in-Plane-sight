import pytest
from pydantic import ValidationError
from app.main import Settings, get_settings, health, update_settings

def resolve(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    raise AssertionError("Tested API handlers should not wait on external I/O")

def test_health_reports_local_inference_and_no_frame_storage():
    status = resolve(health())
    assert status["inference"] == "browser-local"
    assert status["stores_camera_frames"] is False

def test_settings_round_trip_and_validation():
    payload = {"segmentation_sensitivity": 55, "mask_smoothing": 4, "background_blur": True, "gesture_sensitivity": 8, "processing_quality": "Performance"}
    updated = resolve(update_settings(Settings(**payload)))
    assert updated.model_dump() == payload
    assert resolve(get_settings()).model_dump() == payload
    with pytest.raises(ValidationError):
        Settings(**{**payload, "segmentation_sensitivity": 101})
