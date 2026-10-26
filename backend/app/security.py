"""Sign-in: bcrypt passwords, a short-lived JWT in an httpOnly cookie, and lockout after repeated failures."""
from __future__ import annotations

import hmac
import time
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import Cookie, Depends, Header
from sqlalchemy.orm import Session

from . import models as m
from .config import settings
from .db import get_db
from .errors import ApiError
from .store import user_to_dict

COOKIE = "ekatra_session"
ALGO = "HS256"


def make_token(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "exp": int(time.time()) + settings.token_hours * 3600}, settings.jwt_secret, algorithm=ALGO)


def authenticate(db: Session, username: str, password: str) -> m.User:
    u = db.query(m.User).filter(m.User.username == username.strip().lower()).first()
    if not u:
        raise ApiError(401, "invalid_credentials", "That username is not registered. Pick one of the demo accounts below.")
    if u.locked_until and u.locked_until > datetime.now().isoformat(timespec="seconds"):
        raise ApiError(423, "account_locked", "Too many wrong passwords. This account is locked for 15 minutes.")
    if not password or not bcrypt.checkpw(password.encode("utf-8"), u.password_hash.encode("ascii")):
        u.failed_logins += 1
        if u.failed_logins >= settings.max_failed_logins:
            u.locked_until = (datetime.now() + timedelta(minutes=15)).isoformat(timespec="seconds")
            u.failed_logins = 0
        db.commit()
        raise ApiError(401, "invalid_credentials", "The password is not correct.")
    u.failed_logins, u.locked_until = 0, None
    return u


def optional_user(db: Session = Depends(get_db), token: str | None = Cookie(default=None, alias=COOKIE)) -> dict | None:
    if not token:
        return None
    try:
        sub = jwt.decode(token, settings.jwt_secret, algorithms=[ALGO])["sub"]
    except jwt.PyJWTError:
        return None
    u = db.get(m.User, sub)
    return user_to_dict(u) if u else None


def current_user(u: dict | None = Depends(optional_user)) -> dict:
    if not u:
        raise ApiError(401, "not_signed_in", "Please sign in to continue.")
    return u


def require_roles(*roles: str):
    def dep(u: dict = Depends(current_user)) -> dict:
        if u["role"] not in roles:
            raise ApiError(403, "forbidden", "Your role cannot do this.")
        return u
    return dep


def cron_or_admin(x_cron_secret: str | None = Header(default=None), u: dict | None = Depends(optional_user)) -> dict:
    """The hourly check may be called by the scheduler (shared secret, compared in constant time) or by an administrator."""
    if x_cron_secret and settings.cron_secret and hmac.compare_digest(x_cron_secret, settings.cron_secret):
        return {"id": "cron", "name": "Ekatra (automatic)", "role": "system", "unit": None}
    if u and u["role"] == "admin":
        return u
    raise ApiError(403, "forbidden", "Only the scheduler or an administrator can run this.")
