#!/usr/bin/env python3
"""Backup internship schema; restore only into an empty isolated test/restore database."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import re
from urllib.parse import urlparse, unquote


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("operation", choices=["backup", "restore"])
    p.add_argument("archive", type=Path)
    p.add_argument("--allow-remote-backup", action="store_true")
    args = p.parse_args()
    url = urlparse(os.environ.get("BACKUP_DATABASE_URL", ""))
    database = unquote(url.path.lstrip("/"))
    local = url.hostname in ("127.0.0.1", "localhost", "::1")
    if url.scheme not in ("postgres", "postgresql") or not database:
        p.error("Set BACKUP_DATABASE_URL through the environment")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", database):
        p.error("Use a conventional database name; connection strings are not database names")
    if args.operation == "restore" and (not local or not any(x in database.lower() for x in ("test", "restore"))):
        p.error("Restore requires loopback and an isolated database name containing test or restore")
    if not local and not args.allow_remote_backup:
        p.error("Remote backup requires --allow-remote-backup; restore always stays isolated")
    env = os.environ.copy()
    env.update(PGHOST=url.hostname or "", PGPORT=str(url.port or 5432), PGDATABASE=database,
               PGUSER=unquote(url.username or ""), PGPASSWORD=unquote(url.password or ""),
               PGCONNECT_TIMEOUT="10")
    # Preserve explicitly configured TLS settings; remote backups require certificate validation.
    if not local:
        env["PGSSLMODE"] = "verify-full"
    def run(argv):
        return subprocess.run(argv, env=env, text=True, capture_output=True, check=True).stdout.strip()
    server_major = int(run(["psql", "-X", "-tAc", "SHOW server_version_num"])) // 10000
    client = "pg_dump" if args.operation == "backup" else "pg_restore"
    version = re.search(r"(\d+)\.", run([client, "--version"]))
    if not version or int(version.group(1)) != server_major:
        p.error("Use PostgreSQL clients matching the target server major version")
    if args.operation == "backup":
        fd = os.open(args.archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        try:
            run(["pg_dump", "--format=custom", "--schema=internship", "--no-owner", "--no-acl", "--file", str(args.archive)])
        except Exception:
            args.archive.unlink(missing_ok=True)
            raise
        print("Backup created. Store it encrypted with restricted access and a retention policy.")
    else:
        count = run(["psql", "-X", "-tAc", "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"])
        if count != "0":
            p.error("Restore target must be empty; this tool never drops existing data")
        run(["pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "--dbname", database, str(args.archive)])
        print("Restore complete. Verify migrations, row counts, constraints and an application journey before recording RTO/RPO.")

if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, OSError):
        print("Database operation failed; no credentials or database output printed. Check target connectivity and client versions.", file=sys.stderr)
        sys.exit(1)
