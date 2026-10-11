#!/usr/bin/env python3
"""Render PRIVACY.md and TERMS.md to website/privacy.html and website/terms.html.

Minimal on purpose: headings, paragraphs, bullet lists, pipe tables, **bold**, `code`, [text](url), <url>.
Run `python3 scripts/docs-to-html.py` after editing either file.
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = [("PRIVACY.md", "privacy.html", "Privacy Policy"), ("TERMS.md", "terms.html", "Terms of Use and Disclaimer")]

CSS = """
.doc{max-width:760px;margin:0 auto;padding:7rem 1.25rem 4rem;position:relative;z-index:1}
.doc h1{font-size:clamp(2rem,5vw,2.8rem);margin:0 0 .5rem}
.doc h2{font-size:1.3rem;margin:2.2rem 0 .6rem}
.doc p,.doc li{color:var(--ink-soft);line-height:1.65}
.doc a{color:var(--ink);text-decoration:underline}
.doc code{font-size:.88em;background:rgba(20,24,31,.08);padding:.1em .35em;border-radius:4px}
.doc table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.92rem}
.doc th,.doc td{text-align:left;vertical-align:top;padding:.55rem .6rem;border-bottom:1px solid rgba(20,24,31,.14)}
.doc .back{display:inline-block;margin-bottom:1.5rem;font-size:.9rem}
"""


def inline(text: str) -> str:
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: f'<a href="{fix(m.group(2))}">{m.group(1)}</a>', out)
    out = re.sub(r"&lt;(https?://[^&\s]+)&gt;", r'<a href="\1">\1</a>', out)
    return out


def fix(url: str) -> str:
    local = {"LICENSE": "https://github.com/azevedomedia0/CloudBreak-Files/blob/main/LICENSE",
             "THIRD-PARTY-NOTICES.md": "https://github.com/azevedomedia0/CloudBreak-Files/blob/main/THIRD-PARTY-NOTICES.md"}
    return local.get(url, url)


def render(md: str) -> str:
    lines = md.splitlines()
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
        elif line.startswith("# "):
            out.append(f"<h1>{inline(line[2:])}</h1>"); i += 1
        elif line.startswith("## "):
            out.append(f"<h2>{inline(line[3:])}</h2>"); i += 1
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            head, body = rows[0], [r for r in rows[2:]]
            t = "<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            t += "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body)
            out.append(t + "</tbody></table>")
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{inline(lines[i][2:])}</li>"); i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|", "- ")):
                para.append(lines[i]); i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out)


for src, dest, title in PAGES:
    body = render((ROOT / src).read_text())
    page = f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} — CloudBreak Files</title>
    <link rel="icon" type="image/png" href="./assets/icon.png" />
    <link rel="preconnect" href="https://fonts.bunny.net" crossorigin />
    <link href="https://fonts.bunny.net/css?family=kanit:400,500,600,700|dm-sans:400,500,600,700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="./styles.css" />
    <style>{CSS}</style>
  </head>
  <body>
    <main class="doc">
      <a class="back" href="./index.html">&larr; CloudBreak Files</a>
{body}
    </main>
  </body>
</html>
"""
    (ROOT / "website" / dest).write_text(page)
    print("wrote website/" + dest)
