"""Lightweight local pydantic compatibility shim for offline environments."""

from __future__ import annotations

from typing import Any, Dict


class ValidationError(ValueError):
    pass


def Field(default: Any = ..., **_: Any) -> Any:
    return default


def ConfigDict(**kwargs: Any) -> Dict[str, Any]:
    return dict(kwargs)


def field_validator(*_: Any, **__: Any):
    def decorator(func):
        return func

    return decorator


def model_validator(*_: Any, **__: Any):
    def decorator(func):
        return func

    return decorator


class BaseModel:
    model_config: Dict[str, Any] = {}

    def __init__(self, **data: Any):
        for key, value in data.items():
            setattr(self, key, value)

    @classmethod
    def model_validate(cls, payload: Dict[str, Any]):
        if not isinstance(payload, dict):
            raise ValidationError("Payload must be a dict")
        return cls(**payload)
