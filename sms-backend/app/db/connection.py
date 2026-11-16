import psycopg2
import psycopg2.extras
from psycopg2 import pool
from flask import g
import logging

logger = logging.getLogger(__name__)
_pool = None


def init_pool(app):
    """
    Creates the process's connection pool once. Calling create_app() again in
    the same process (e.g. a lazy `import main` inside a background job) must
    NOT replace the pool: connections already borrowed from the old pool could
    then never be returned ("trying to put unkeyed connection").
    ThreadedConnectionPool, because both the API (FastAPI sync endpoints and
    Flask via a2wsgi run on threads) and APScheduler use threads; the old
    SimpleConnectionPool is not thread-safe.
    """
    global _pool
    if _pool is None:
        _pool = pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=20,
            host=app.config["DB_HOST"],
            port=app.config["DB_PORT"],
            dbname=app.config["DB_NAME"],
            user=app.config["DB_USER"],
            password=app.config["DB_PASSWORD"],
        )
        logger.info("DB connection pool initialised.")
    else:
        logger.info("DB connection pool already initialised - reusing it.")
    app.teardown_appcontext(close_db)


def get_db():
    if "db" not in g:
        g.db = _pool.getconn()
        g.db.autocommit = False
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        if e is None:
            try:
                db.commit()
            except Exception:
                db.rollback()
        else:
            db.rollback()
        _pool.putconn(db)


def execute_query(sql: str, params=None, fetch="all"):
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql, params or ())
    if fetch == "all":
        return cur.fetchall()
    elif fetch == "one":
        return cur.fetchone()
    return None


def call_procedure(proc_name: str, params: dict):
    db = get_db()
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    placeholders = ", ".join(["%s"] * len(params))
    cur.execute(f"CALL {proc_name}({placeholders})", list(params.values()))
    db.commit()
    try:
        return cur.fetchone()
    except Exception:
        return None