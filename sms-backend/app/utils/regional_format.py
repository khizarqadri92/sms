from datetime import date as _date, datetime as _dt
from app.fastapi_db import get_cur

DEFAULT_SETTINGS = {
    "date_format": "DD/MM/YYYY", "time_format": "24h", "decimal_places": "2",
    "region": "en-PK", "currency_code": "PKR", "currency_symbol": "Rs",
    "currency_position": "prefix", "timezone": "Asia/Karachi",
    "weekend_days": "Saturday,Sunday", "first_day_of_week": "Monday",
    "academic_year_start_month": "4", "fiscal_year_start_month": "7",
    "default_country_code": "+92",
}


def get_regional_settings(db):
    cur = get_cur(db)
    cur.execute("SELECT key, value FROM system_settings WHERE category=%s", ("regional_format",))
    rows = cur.fetchall()
    settings = dict(DEFAULT_SETTINGS)
    for r in rows:
        settings[r["key"]] = r["value"]
    return settings


def format_date(d, settings=None):
    if d is None:
        return ""
    if isinstance(d, str):
        d = _dt.fromisoformat(d).date()
    if isinstance(d, _dt):
        d = d.date()
    fmt = (settings or DEFAULT_SETTINGS).get("date_format", "DD/MM/YYYY")
    if fmt == "MM/DD/YYYY":
        return d.strftime("%m/%d/%Y")
    if fmt == "YYYY-MM-DD":
        return d.strftime("%Y-%m-%d")
    if fmt == "DD-MM-YYYY":
        return d.strftime("%d-%m-%Y")
    if fmt == "DD MMM YYYY":
        return d.strftime("%d %b %Y")
    if fmt == "MMM DD, YYYY":
        return d.strftime("%b %d, %Y")
    if fmt == "DD MMMM YYYY":
        return d.strftime("%d %B %Y")
    if fmt == "MMMM DD, YYYY":
        return d.strftime("%B %d, %Y")
    return d.strftime("%d/%m/%Y")


def format_currency(amount, settings=None):
    s = settings or DEFAULT_SETTINGS
    decimals = int(s.get("decimal_places", 2))
    symbol = s.get("currency_symbol", "Rs")
    position = s.get("currency_position", "prefix")
    formatted = f"{float(amount or 0):,.{decimals}f}"
    return f"{symbol} {formatted}" if position == "prefix" else f"{formatted} {symbol}"


def get_weekend_days(settings=None):
    s = settings or DEFAULT_SETTINGS
    return [d.strip() for d in s.get("weekend_days", "Saturday,Sunday").split(",") if d.strip()]


def is_weekend(d, settings=None):
    if isinstance(d, str):
        d = _dt.fromisoformat(d).date()
    if isinstance(d, _dt):
        d = d.date()
    day_name = d.strftime("%A")
    return day_name in get_weekend_days(settings)
