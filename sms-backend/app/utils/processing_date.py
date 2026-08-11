from datetime import date as _date, datetime as _dt, timezone as _tz, timedelta as _td
from app.fastapi_db import get_cur


def get_processing_date(db):
    cur = get_cur(db)
    cur.execute("SELECT current_processing_date FROM processing_date ORDER BY id LIMIT 1")
    row = cur.fetchone()
    return row["current_processing_date"] if row else _date.today()


def get_processing_datetime(db):
    """Returns the current processing datetime (timezone-aware, UTC), combining:
    - the DATE portion from processing_date (advances daily, or via manual override)
    - the TIME-OF-DAY portion from processing_time (real clock, or manual offset)
    These are two independently-tracked systems; this combines them into one coherent
    datetime for use as created_at/updated_at timestamps instead of the database's NOW()."""
    cur = get_cur(db)
    cur.execute("SELECT current_processing_date FROM processing_date ORDER BY id LIMIT 1")
    date_row = cur.fetchone()
    proc_date = date_row["current_processing_date"] if date_row else _date.today()

    cur.execute("SELECT time_offset_seconds FROM processing_time ORDER BY id LIMIT 1")
    time_row = cur.fetchone()
    offset = time_row["time_offset_seconds"] if time_row else 0
    now_with_offset = _dt.now(_tz.utc) + _td(seconds=offset)

    return _dt(proc_date.year, proc_date.month, proc_date.day,
                now_with_offset.hour, now_with_offset.minute, now_with_offset.second,
                now_with_offset.microsecond, tzinfo=_tz.utc)
