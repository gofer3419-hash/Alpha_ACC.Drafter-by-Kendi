"""Minimal parser for Eugen text NDF files (WARNO / WiF mod sources).

Representation of parsed values:
  object  -> NdfObject (dict subclass) with .type and optional .name
  list    -> list
  MAP     -> NdfMap (list of (key, value) tuples with .get())
  tuple   -> tuple
  ref / identifier / enum -> str (e.g. "$/GFX/Unit/Descriptor_Unit_X", "Factory/Art")
  string  -> str (quotes stripped)
  GUID    -> str "GUID:{...}"
  number  -> int | float
  bool    -> bool, nil -> None
  expression that cannot be evaluated -> NdfExpr(str)
"""
import re

_TOKEN_RE = re.compile(
    r"""
    (?P<ws>\s+)
  | (?P<lcomment>//[^\n]*)
  | (?P<bcomment>\(\*.*?\*\)|/\*.*?\*/)
  | (?P<guid>GUID:\{[^}]*\})
  | (?P<string>'[^']*'|"[^"]*")
  | (?P<number>\d+\.\d*(?:[eE][-+]?\d+)?|\d*\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)
  | (?P<word>[A-Za-z_$~][A-Za-z0-9_$~/.]*)
  | (?P<punct>[()\[\],=+\-*|%<>:{}])
  | (?P<slash>/)
    """,
    re.VERBOSE | re.DOTALL,
)


class NdfObject(dict):
    __slots__ = ("type", "name")

    def __init__(self, type_, name=None):
        super().__init__()
        self.type = type_
        self.name = name

    def __repr__(self):
        return f"<{self.type} {self.name or ''} {dict.__repr__(self)[:200]}>"


class NdfMap(list):
    def get(self, key, default=None):
        for k, v in self:
            if k == key:
                return v
        return default

    def as_dict(self):
        return {k: v for k, v in self}


class NdfExpr(str):
    pass


class NdfSyntaxError(Exception):
    pass


def tokenize(text):
    toks = []
    append = toks.append
    for m in _TOKEN_RE.finditer(text):
        kind = m.lastgroup
        if kind in ("ws", "lcomment", "bcomment"):
            continue
        val = m.group()
        if kind == "number":
            append(("num", float(val) if ("." in val or "e" in val or "E" in val) else int(val)))
        elif kind == "string":
            append(("str", val[1:-1]))
        elif kind == "guid":
            append(("guid", val))
        elif kind == "word":
            append(("word", val))
        else:
            append(("p", val))
    return toks


_BINOPS = {"+", "-", "*", "/", "|", "%", "div"}


class Parser:
    def __init__(self, text):
        self.toks = tokenize(text)
        self.i = 0

    # helpers -------------------------------------------------------------
    def peek(self, k=0):
        j = self.i + k
        return self.toks[j] if j < len(self.toks) else (None, None)

    def next(self):
        t = self.toks[self.i]
        self.i += 1
        return t

    def expect(self, val):
        t = self.next()
        if t[1] != val:
            raise NdfSyntaxError(f"expected {val!r} got {t!r} at token {self.i}")
        return t

    def is_p(self, val, k=0):
        t = self.peek(k)
        return t[0] == "p" and t[1] == val

    # top level -----------------------------------------------------------
    def parse(self):
        """Return dict name -> value for every top level declaration.
        Unnamed objects are stored under '__unnamed__<n>'."""
        out = {}
        n = 0
        while self.i < len(self.toks):
            t = self.peek()
            if t == ("word", "export") or t == ("word", "private"):
                self.next()
                t = self.peek()
            if t == ("word", "unnamed"):
                self.next()
                val = self.parse_value()
                out[f"__unnamed__{n}"] = val
                n += 1
                continue
            if t[0] == "word" and self.peek(1) == ("word", "is"):
                name = self.next()[1]
                self.next()
                val = self.parse_value(name=name)
                out[name] = val
                continue
            raise NdfSyntaxError(f"unexpected top-level token {t!r} at {self.i}")
        return out

    # values --------------------------------------------------------------
    def parse_value(self, name=None):
        left = self.parse_primary(name)
        while True:
            t = self.peek()
            if (t[0] == "p" and t[1] in _BINOPS) or t == ("word", "div"):
                # A '-' directly followed by a member key would be odd; treat as op
                op = self.next()[1]
                right = self.parse_primary()
                left = _apply(op, left, right)
            else:
                return left

    def parse_primary(self, name=None):
        kind, val = self.next()
        if kind == "num" or kind == "str" or kind == "guid":
            return val
        if kind == "p":
            if val == "-":
                v = self.parse_primary()
                return -v if isinstance(v, (int, float)) else NdfExpr(f"-{v}")
            if val == "[":
                return self.parse_list_body()
            if val == "(":
                return self.parse_tuple_body()
            raise NdfSyntaxError(f"unexpected {val!r} at {self.i}")
        # word
        if val == "True":
            return True
        if val == "False":
            return False
        if val == "nil":
            return None
        if val == "MAP" and self.is_p("["):
            self.next()
            return self.parse_map_body()
        if self.peek() == ("word", "is"):  # inline named value: X is Y(...)
            self.next()
            return self.parse_value(name=val)
        if self.is_p("("):
            self.next()
            return self.parse_object_body(val, name)
        if self.is_p("[") and val in ("RGBA", "RGB"):
            self.next()
            return self.parse_list_body()
        return val

    def parse_list_body(self):
        items = []
        while True:
            if self.is_p("]"):
                self.next()
                return items
            items.append(self.parse_value())
            if self.is_p(","):
                self.next()

    def parse_map_body(self):
        m = NdfMap()
        while True:
            if self.is_p("]"):
                self.next()
                return m
            self.expect("(")
            k = self.parse_value()
            self.expect(",")
            v = self.parse_value()
            self.expect(")")
            m.append((k, v))
            if self.is_p(","):
                self.next()

    def parse_tuple_body(self):
        items = []
        while True:
            if self.is_p(")"):
                self.next()
                return tuple(items)
            items.append(self.parse_value())
            if self.is_p(","):
                self.next()

    def parse_object_body(self, type_, name):
        obj = NdfObject(type_, name)
        # Empty object, or object with members "key = value"
        while True:
            if self.is_p(")"):
                self.next()
                return obj
            t = self.next()
            if t[0] != "word":
                raise NdfSyntaxError(f"bad member key {t!r} at {self.i} in {type_}")
            self.expect("=")
            obj[t[1]] = self.parse_value()
            if self.is_p(","):
                self.next()


def _apply(op, a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        try:
            if op == "+":
                return a + b
            if op == "-":
                return a - b
            if op == "*":
                return a * b
            if op in ("/", "div"):
                return a / b if b else 0
            if op == "%":
                return a % b
            if op == "|":
                return int(a) | int(b)
        except Exception:
            pass
    return NdfExpr(f"{a} {op} {b}")


def parse_file(path):
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        return Parser(f.read()).parse()


def parse_text(text):
    return Parser(text).parse()
