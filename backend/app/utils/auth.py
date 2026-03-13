from datetime import datetime, timedelta


def build_mock_token(role: str, username: str) -> str:
    expires_at = (datetime.utcnow() + timedelta(hours=8)).isoformat()
    return f"{role}:{username}:{expires_at}"
