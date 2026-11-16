"""
One place that reads the school's identity for printed documents (fee invoice,
payment receipt, result card, certificate, ...).

  * school_name is saved by the superadmin under its own category ("school_name"),
    the other details under "school_info" - read the name by KEY, whatever the category.
  * campus_settings_overrides (if present) can override any of these per campus,
    so a campus can print its own name / address / logo.

Works with a psycopg2 RealDictCursor or a plain cursor.
"""
import base64

KEYS = ("school_name", "school_address", "school_city", "school_phone", "school_email", "school_logo",
        "school_website", "school_tagline", "bank_name", "bank_account_no", "bank_iban")
DEFAULT_NAME = "School"


def _rows(cur):
    out = []
    for r in cur.fetchall():
        out.append(r if isinstance(r, dict) else {d[0]: v for d, v in zip(cur.description, r)})
    return out


def _cols(cur, table):
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    return {r["column_name"] for r in _rows(cur)}


def get_school_settings(cur, campus_id=None):
    """{key: value} for the school's identity, with the campus's overrides applied."""
    cur.execute("SELECT key, value FROM system_settings WHERE key = ANY(%s) OR category = 'school_info'", (list(KEYS),))
    st = {}
    for r in _rows(cur):
        if r["value"] not in (None, ""):
            st[r["key"]] = r["value"]
    if campus_id:
        try:
            cols = _cols(cur, "campus_settings_overrides")
            key_col = "key" if "key" in cols else ("setting_key" if "setting_key" in cols else None)
            val_col = "value" if "value" in cols else ("setting_value" if "setting_value" in cols else None)
            if key_col and val_col and "campus_id" in cols:
                cur.execute(f"SELECT {key_col} AS k, {val_col} AS v FROM campus_settings_overrides "
                            f"WHERE campus_id=%s AND {key_col} = ANY(%s)", (campus_id, list(KEYS)))
                for r in _rows(cur):
                    if r["v"] not in (None, ""):
                        st[r["k"]] = r["v"]
        except Exception:
            try: cur.connection.rollback()
            except Exception: pass
    return st


def get_school_info(cur, campus_id=None):
    """Ready-to-print identity: name, one-line address, phone, email, logo bytes."""
    st = get_school_settings(cur, campus_id)
    logo = None
    data = st.get("school_logo") or ""
    if "base64," in data:
        try:
            logo = base64.b64decode(data.split("base64,", 1)[1])
        except Exception:
            logo = None
    addr, city = (st.get("school_address") or "").strip(), (st.get("school_city") or "").strip()
    # add the city only if the address doesn't already end with / contain it
    address = addr if (city and city.lower() in addr.lower()) else ", ".join(x for x in (addr, city) if x)
    return {"name": st.get("school_name") or DEFAULT_NAME, "address": address,
            "phone": st.get("school_phone") or "", "email": st.get("school_email") or "",
            "logo_bytes": logo, "settings": st}
