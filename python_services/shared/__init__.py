"""
Shared utilities and types for Lucid Learn AI services.
"""

__version__ = "0.1.0"

# Convenience re-exports
from .models import *  # noqa: F401,F403
from .llm_client import get_llm_client  # noqa: F401
from .vector_db import get_vector_db  # noqa: F401