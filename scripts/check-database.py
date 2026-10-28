"""Check DATABASE_URL with a TLS connection and read-only SELECT 1.

Run from a network-enabled terminal: python scripts/check-database.py
Requires psycopg2 (install with: python -m pip install psycopg2-binary).
No migrations or data changes are performed. Credentials are never printed.
"""

import json
import os
from pathlib import Path
import sys
from urllib.parse import parse_qs, unquote, urlsplit


def database_url():
    value = os.environ.get("DATABASE_URL")
    if value:
        return value
    env_file = Path(__file__).resolve().parents[1] / ".env"
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("DATABASE_URL="):
            value = line.split("=", 1)[1].strip()
            if value.startswith('"'):
                return json.loads(value)
            if value.startswith("'") and value.endswith("'"):
                return value[1:-1]
            return value
    raise ValueError("DATABASE_URL is missing")


def main():
    try:
        import psycopg2
    except ImportError:
        print("Missing driver. Run: python -m pip install psycopg2-binary")
        return 2

    try:
        url = urlsplit(database_url())
        if url.scheme not in ("postgres", "postgresql") or not url.hostname:
            raise ValueError("Invalid PostgreSQL URL")
        sslmode = parse_qs(url.query).get("sslmode", ["require"])[0]
        if sslmode not in ("require", "verify-ca", "verify-full"):
            raise ValueError("TLS is required")
        password = unquote(url.password or "")
        if not password or password == "[YOUR-PASSWORD]":
            raise ValueError("Database password is missing")
        parameters = dict(
            host=url.hostname,
            port=url.port or 5432,
            dbname=unquote(url.path.lstrip("/")),
            user=unquote(url.username or ""),
            password=password,
            sslmode=sslmode,
            connect_timeout=8,
            options="-c default_transaction_read_only=on -c statement_timeout=5000",
        )
    except (OSError, ValueError, TypeError):
        print("Check DATABASE_URL in .env: a PostgreSQL URL, encoded password, and TLS are required.")
        return 2

    connection = None
    try:
        connection = psycopg2.connect(**parameters)
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            passed = cursor.fetchone() == (1,) and connection.info.ssl_in_use
        print("PASS: Database authentication, TLS, and read-only SELECT 1." if passed else "FAIL: Database check did not pass.")
        return 0 if passed else 1
    except psycopg2.Error as error:
        # Never print the driver's raw message: it can contain connection details.
        message = str(error).lower()
        if error.pgcode == "28P01" or "password authentication failed" in message:
            reason = "Database rejected the username or password."
        elif any(text in message for text in ("permission denied", "forbidden", "10013")):
            reason = "Network permission denied before database authentication. Run in a network-enabled terminal."
        elif "could not translate host name" in message:
            reason = "Database hostname could not be resolved."
        elif "timeout" in message:
            reason = "Database connection timed out."
        else:
            reason = "Database connection or query failed. Check the host, port, TLS, and project status."
        print("FAIL: " + reason)
        return 1
    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    sys.exit(main())
