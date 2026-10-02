from .base import *  # noqa: F403

# Plain-http development servers: Safari drops Secure cookies on http://localhost.
AUTH_REFRESH_COOKIE = {**AUTH_REFRESH_COOKIE, "SECURE": env.bool("AUTH_COOKIE_SECURE", default=False)}  # noqa: F405
