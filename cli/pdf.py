#!/usr/bin/env python
"""Render an HTML file to PDF with Playwright (Chromium).

Usage:
    python cli/pdf.py <input.html> <output.pdf>

Setup (one time, from the patentviz folder):
    pip install playwright
    python -m playwright install chromium

If the HTML declares an @page size, that size is used. Otherwise the page
is sized to the document's own width and height.
"""
import pathlib
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright is not installed. Run:")
    print("  pip install playwright")
    print("  python -m playwright install chromium")
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)

    src = pathlib.Path(sys.argv[1]).resolve()
    dst = pathlib.Path(sys.argv[2]).resolve()

    if not src.exists():
        print(f"Input HTML not found: {src}")
        sys.exit(1)

    dst.parent.mkdir(parents=True, exist_ok=True)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.goto(src.as_uri(), wait_until="load")
            page.wait_for_timeout(500)  # let web fonts and animations settle
            page.emulate_media(media="print")

            # Size the PDF to the document unless the HTML sets its own @page size.
            size = page.evaluate(
                "() => ({w: Math.ceil(document.documentElement.scrollWidth),"
                " h: Math.ceil(document.documentElement.scrollHeight)})"
            )
            page.pdf(
                path=str(dst),
                width=f"{size['w']}px",
                height=f"{size['h']}px",
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            browser.close()
    except Exception as e:
        msg = str(e)
        if "Executable doesn't exist" in msg or "playwright install" in msg:
            print("Chromium for Playwright is missing. Run:")
            print("  python -m playwright install chromium")
        else:
            print(f"PDF render failed: {msg}")
        sys.exit(1)

    print(f"PDF written: {dst}")


if __name__ == "__main__":
    main()