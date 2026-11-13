"""Cosa e' cambiato per un codice tra due versioni dei dati TARIC (avvisi sui preferiti).

Per ogni codice si confrontano le misure che lo riguardano, sue e dei livelli superiori della nomenclatura (come
misure() di app.js), all'importazione e all'esportazione: dazio, condizioni (documenti), inizio e fine. Una misura e'
riconosciuta dal tipo, dal paese o gruppo di paesi, dal codice addizionale, dal contingente e dai paesi esclusi; se una
di queste cose cambia, la vecchia risulta tolta e la nuova aggiunta. Si segnalano anche la descrizione cambiata e il
codice che non c'e' piu'. I file sono quelli generati da aggiorna.py (nomenclatura.js e m/CC.js)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _json_js(f: Path) -> Any:
    """Il JSON di un file dei dati: window.TARIC_DATA={...}; oppure window.TARIC_M=window.TARIC_M||{};window.TARIC_M["64"]={...};"""
    testo = f.read_text(encoding="utf-8")
    if testo.startswith("window.TARIC_M"):
        inizio = testo.index('"]=', testo.index('window.TARIC_M["')) + 3
    else:
        inizio = testo.index("{")
    return json.loads(testo[inizio:testo.rindex("}") + 1])


@lru_cache(maxsize=4)
def _nomenclatura(cartella: str) -> dict[str, tuple[str, list[str]]]:
    """codice -> (descrizione, codici dei livelli superiori e del codice stesso, senza i gruppi), per una versione."""
    righe = _json_js(Path(cartella) / "nomenclatura.js").get("righe", "").split("\n")
    out: dict[str, tuple[str, list[str]]] = {}
    pila: list[tuple[int, str, str]] = []          # (livello, codice, tipo di riga)
    for r in righe:
        if len(r) < 13:
            continue
        codice, tipo, livello = r[:10], r[10], int(r[12], 16)
        testo = r[14 if r[13] == "\x01" else 13:].replace("\x1f", "\n")
        while pila and pila[-1][0] >= livello:
            pila.pop()
        pila.append((livello, codice, tipo))
        if tipo != "g":
            out[codice] = (testo, [c for _, c, t in pila if t != "g"])
    return out


@lru_cache(maxsize=64)
def _capitolo(cartella: str, cap: str) -> dict[str, Any]:
    f = Path(cartella) / "m" / f"{cap}.js"
    return _json_js(f) if f.is_file() else {"s": [], "m": {}, "x": {}}


def _misure(cartella: Path, codice: str) -> dict[tuple, list[tuple]] | None:
    nom = _nomenclatura(str(cartella))
    if codice not in nom:
        return None
    cap = _capitolo(str(cartella), codice[:2])
    s = cap.get("s", [])
    out: dict[tuple, list[tuple]] = {}
    for flusso, chiave in (("import", "m"), ("export", "x")):
        tab = cap.get(chiave, {})
        for livello in nom[codice][1]:
            for r in tab.get(livello, []):
                # [tipo, origine, dazio, inizio, fine, addizionale, contingente, base, esclusi, note, condizioni, ...]
                ident = (flusso, int(r[0]), str(r[1]), str(r[5] or ""), str(r[6] or ""), str(r[8] or ""))
                dazio = s[r[2]] if isinstance(r[2], int) and 0 <= r[2] < len(s) and r[2] else ""
                cond = s[r[10]] if len(r) > 10 and isinstance(r[10], int) and 0 < r[10] < len(s) else ""
                out.setdefault(ident, []).append((dazio, cond, int(r[3] or 0), int(r[4] or 0)))
    return {k: sorted(v) for k, v in out.items()}


def cambi(vecchia: Path, nuova: Path, codici: list[str]) -> dict[str, dict[str, Any]]:
    """Per ogni codice con differenze tra le due versioni: descrizione cambiata, codice sparito, misure aggiunte,
    tolte o cambiate. I codici senza differenze non compaiono."""
    out: dict[str, dict[str, Any]] = {}
    nom_v, nom_n = _nomenclatura(str(vecchia)), _nomenclatura(str(nuova))
    for codice in codici:
        if codice not in nom_v:
            continue                                   # preferito aggiunto dopo: niente da confrontare
        if codice not in nom_n:
            out[codice] = {"sparito": True, "misure": []}
            continue
        prima, dopo = _misure(vecchia, codice) or {}, _misure(nuova, codice) or {}
        misure = []
        for ident in sorted(set(prima) | set(dopo)):
            a, b = prima.get(ident), dopo.get(ident)
            if a == b:
                continue
            flusso, tipo, origine, add, ordine, esclusi = ident
            def righe(x: list[tuple] | None) -> list[dict[str, Any]]:
                return [{"dazio": d, "condizioni": c, "dal": da, "al": al} for d, c, da, al in (x or [])]
            misure.append({"flusso": flusso, "tipo": tipo, "origine": origine, "addizionale": add, "contingente": ordine,
                           "esclusi": esclusi, "prima": righe(a), "dopo": righe(b)})
        descr = nom_v[codice][0] != nom_n[codice][0]
        if misure or descr:
            out[codice] = {"sparito": False, "descrizione": nom_n[codice][0] if descr else None, "misure": misure}
    return out


__all__ = ["cambi"]
