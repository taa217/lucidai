"""Base class for all agents in the slide orchestrator."""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from functools import wraps
from typing import Any, Callable, TypeVar

import backoff

from .communication import fetch_messages, send_message

logger = logging.getLogger(__name__)

T = TypeVar("T")


class AgentBase(ABC):
    """Base class for all agents with common functionality."""

    max_retries: int = 3

    def __init__(self, agent_id: str) -> None:
        self.agent_id = agent_id
        self.name = agent_id  # For backward compatibility
        self.logger = logging.getLogger(f"{self.__class__.__name__}[{agent_id}]")
        self.logger.info(f"🤖 Agent {self.agent_id} initialized")

    @abstractmethod
    async def run(self) -> None:
        """Main agent loop - must be implemented by subclasses."""
        pass

    async def start(self) -> None:
        """Start the agent."""
        self.logger.info(f"🚀 Starting agent {self.agent_id}")
        try:
            await self.run()
        except Exception as e:
            self.logger.error(f"❌ Agent {self.agent_id} failed: {e}")
            raise
        finally:
            self.logger.info(f"🛑 Agent {self.agent_id} stopped")

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.agent_id})"

    # ---------------------------------------------------------------------
    # Retry decorator ------------------------------------------------------
    # ---------------------------------------------------------------------

    @classmethod
    def retryable(cls, func: Callable[..., Any]) -> Callable[..., Any]:
        """Async retry decorator using exponential backoff."""

        @backoff.on_exception(
            backoff.expo,
            Exception,  # pylint: disable=broad-exception-caught
            max_tries=cls.max_retries,
            giveup=lambda e: isinstance(e, ValueError),  # don't retry invalid inputs
            jitter=backoff.full_jitter,
        )
        async def _wrapper(*args: Any, **kwargs: Any) -> Any:
            logger.debug("Retryable call %s args=%s kwargs=%s", func.__name__, args, kwargs)
            return await func(*args, **kwargs)

        return _wrapper

    # ---------------------------------------------------------------------
    # Error logging helper -------------------------------------------------
    # ---------------------------------------------------------------------

    def log_error(self, message: str, exc: Exception | None = None) -> None:
        """Record error with standardized format."""
        if exc:
            self.logger.error(f"[{self.agent_id}] {message}: {exc}")
        else:
            self.logger.error(f"[{self.agent_id}] {message}")

    # ------------------------------------------------------------------
    # Messaging helpers -------------------------------------------------
    # ------------------------------------------------------------------

    def send(self, receiver: str, msg_type: str, payload: Any) -> str:
        """Convenience wrapper around communication.send_message."""
        return send_message(self.name, receiver, msg_type, payload)

    def recv_all(self) -> list[Any]:
        """Fetch and return payloads of all unread messages for this agent."""
        return [m["payload"] for m in fetch_messages(self.name)] 