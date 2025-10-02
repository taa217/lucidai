from __future__ import annotations

from typing import Any, Dict, Optional
import httpx
from shared.config import get_settings


async def fetch_user_customizations(user_id: Optional[str] = None, auth_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    
    settings = get_settings()
    main_server_url = settings.main_server_url

    try:
        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            response = await client.get(f"{main_server_url}/api/users/customize", headers=headers)
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("data"):
                    return data["data"]
    except Exception as e:
        print(f"[user_prefs] fetch failed: {e}")

    return None


