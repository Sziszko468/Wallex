"""The Hungarian catalog (locale/hu/LC_MESSAGES/django.po) against the code.

Every text the server writes goes through gettext. These tests read the source with `ast`
(no xgettext needed) and check the catalog in both directions: nothing in the code is missing
from it, nothing in it is left over, and every entry is a finished translation that keeps the
placeholders of the English text.
"""

import ast
import re
from pathlib import Path

import pytest
from django.utils import translation

BACKEND = Path(__file__).resolve().parent.parent
PO_FILE = BACKEND / "locale" / "hu" / "LC_MESSAGES" / "django.po"

GETTEXT_FUNCTIONS = {"_", "gettext", "gettext_lazy", "gettext_noop", "pgettext"}
PLURAL_FUNCTIONS = {"ngettext", "ngettext_lazy"}
# Texts that come from other packages' catalogs (Django, DRF) or are the apps' own enum labels
# are not needed here; the code scan covers only what apps/ writes itself.
SKIPPED_DIRECTORIES = {"migrations", "__pycache__"}


def _string(node: ast.AST) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def messages_in_code() -> set[str]:
    """msgids of every gettext call in apps/ (plural calls: the singular form)."""
    found: set[str] = set()
    for path in (BACKEND / "apps").rglob("*.py"):
        if SKIPPED_DIRECTORIES & set(path.parts) or path.name.startswith("test"):
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not (isinstance(node, ast.Call) and node.args):
                continue
            name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", "")
            if name in GETTEXT_FUNCTIONS | PLURAL_FUNCTIONS:
                text = _string(node.args[0])
                if text:
                    found.add(text)
    return found


# --- a small .po reader ----------------------------------------------------------------------


def _unquote(line: str) -> str:
    return ast.literal_eval(line.strip())


def read_po(path: Path) -> list[dict]:
    entries, current, field = [], {}, None
    for raw in path.read_text(encoding="utf-8").splitlines() + [""]:
        line = raw.strip()
        if not line:
            if current.get("msgid") is not None:
                entries.append(current)
            current, field = {}, None
        elif line.startswith("#,"):
            current["flags"] = line[2:].split(",")
            current["flags"] = [flag.strip() for flag in current["flags"]]
        elif line.startswith("#"):
            continue
        elif line.startswith("msgid_plural"):
            field = "msgid_plural"
            current[field] = _unquote(line[len("msgid_plural") :])
        elif line.startswith("msgid"):
            field = "msgid"
            current[field] = _unquote(line[len("msgid") :])
        elif line.startswith("msgstr["):
            index = int(re.match(r"msgstr\[(\d+)\]", line).group(1))
            field = ("msgstr", index)
            current.setdefault("msgstr_plural", {})[index] = _unquote(line.split("]", 1)[1])
        elif line.startswith("msgstr"):
            field = "msgstr"
            current[field] = _unquote(line[len("msgstr") :])
        elif line.startswith('"'):
            text = _unquote(line)
            if isinstance(field, tuple):
                current["msgstr_plural"][field[1]] += text
            else:
                current[field] += text
    return [entry for entry in entries if entry["msgid"] != ""]  # "" is the file header


def placeholders(text: str) -> list[str]:
    return sorted(re.findall(r"%\([a-z_]+\)[sd]", text))


@pytest.fixture(scope="module")
def entries() -> list[dict]:
    return read_po(PO_FILE)


def test_catalog_exists():
    assert PO_FILE.exists(), "locale/hu/LC_MESSAGES/django.po is missing"


def test_every_text_in_the_code_is_translated(entries):
    translated = {entry["msgid"] for entry in entries}
    missing = sorted(messages_in_code() - translated)
    assert missing == [], f"{len(missing)} text(s) have no Hungarian translation — run makemessages and translate them"


def test_catalog_has_no_leftovers(entries):
    in_code = messages_in_code()
    leftovers = sorted(entry["msgid"] for entry in entries if entry["msgid"] not in in_code)
    assert leftovers == [], "texts in the catalog that no code uses any more — run makemessages --no-obsolete"


def test_no_entry_is_unfinished(entries):
    unfinished = []
    for entry in entries:
        translations = entry.get("msgstr_plural", {}).values() if "msgid_plural" in entry else [entry.get("msgstr", "")]
        if "fuzzy" in entry.get("flags", []) or any(not text.strip() for text in translations):
            unfinished.append(entry["msgid"])
    assert unfinished == []


def test_translations_keep_the_placeholders_of_the_english_text(entries):
    broken = []
    for entry in entries:
        if "msgid_plural" in entry:
            expected = placeholders(entry["msgid_plural"])
            if any(placeholders(text) != expected for text in entry["msgstr_plural"].values()):
                broken.append(entry["msgid"])
        elif placeholders(entry["msgstr"]) != placeholders(entry["msgid"]):
            broken.append(entry["msgid"])
    assert broken == []


def test_percent_signs_are_escaped_the_same_way(entries):
    """ "%(percent)s%%" in the English text needs "%%" in the translation too, or formatting fails."""
    broken = [
        entry["msgid"]
        for entry in entries
        if "msgid_plural" not in entry and entry["msgid"].count("%%") != entry["msgstr"].count("%%")
    ]
    assert broken == []


def test_nothing_is_left_in_english(entries):
    """A translation equal to its English text is a forgotten one (short names like "OK" excepted)."""
    same = [
        entry["msgid"]
        for entry in entries
        if "msgid_plural" not in entry
        and entry["msgid"] == entry["msgstr"]
        and len(re.sub(r"%\([a-z_]+\)[sd]|[^A-Za-z]", "", entry["msgid"])) > 12
    ]
    assert same == []


def test_every_translation_formats_without_errors(entries):
    """Fill every placeholder: a stray % or a wrong key would raise here, not in production."""
    for entry in entries:
        texts = entry["msgstr_plural"].values() if "msgid_plural" in entry else [entry["msgstr"]]
        for text in texts:
            keys = {key[2:-2]: 1 for key in re.findall(r"%\([a-z_]+\)[sd]", text)}
            text % keys


def test_hungarian_is_what_the_catalog_serves():
    with translation.override("hu"):
        assert translation.gettext("Wrong password.") == "Hibás jelszó."
    with translation.override("en"):
        assert translation.gettext("Wrong password.") == "Wrong password."


def test_plural_forms_header_matches_the_languages():
    header = PO_FILE.read_text(encoding="utf-8").split("\n\n", 1)[0]
    assert "Language: hu" in header
    assert "nplurals=2" in header
