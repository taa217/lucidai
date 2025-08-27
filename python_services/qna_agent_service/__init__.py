"""
Q&A Agent Service - Handles question and answer interactions for students.
"""

__version__ = "0.1.0"

from .agent import QnAAgent  # re-export for convenience

__all__ = ["QnAAgent", "__version__"]