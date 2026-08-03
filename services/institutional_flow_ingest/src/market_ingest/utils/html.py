from __future__ import annotations

from bs4 import BeautifulSoup


def extract_links(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []
    for node in soup.find_all("a", href=True):
        href = node.get("href")
        if href:
            links.append(href)
    return links


def extract_table_rows(html: str) -> list[list[str]]:
    soup = BeautifulSoup(html, "lxml")
    rows: list[list[str]] = []
    for row in soup.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])]
        if cells:
            rows.append(cells)
    return rows
