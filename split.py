from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "원문"
OUTPUT_FILE = ROOT / "data" / "문항목록.csv"


@dataclass
class Item:
    file_name: str
    committee: str
    member: str
    due_date: str
    number: int
    request_lines: list[str] = field(default_factory=list)
    detail_lines: list[str] = field(default_factory=list)
    note_lines: list[str] = field(default_factory=list)
    original_lines: list[str] = field(default_factory=list)
    last_part: str = "request"

    def add_continuation(self, text: str) -> None:
        if self.last_part == "detail" and self.detail_lines:
            self.detail_lines[-1] = f"{self.detail_lines[-1]} {text}".strip()
        elif self.last_part == "note" and self.note_lines:
            self.note_lines[-1] = f"{self.note_lines[-1]} {text}".strip()
        else:
            self.request_lines.append(text)
            self.last_part = "request"

    def row(self) -> dict[str, str]:
        return {
            "파일명": self.file_name,
            "위원회": self.committee,
            "의원": self.member,
            "제출기한": self.due_date,
            "문항번호": str(self.number),
            "요구내용": " ".join(self.request_lines).strip(),
            "세부항목": " / ".join(self.detail_lines).strip(),
            "비고": " / ".join(self.note_lines).strip(),
        }


def read_pdf_lines(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        for line in text.splitlines():
            cleaned = normalize_line(line)
            if cleaned:
                lines.append(cleaned)
    return lines


def normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def parse_header(first_line: str) -> tuple[str, str]:
    match = re.match(r"^(?P<committee>.+?위원회)\s+(?P<member>.+?)\s+의원실\s+자료요구서$", first_line)
    if not match:
        raise ValueError(f"첫 줄 형식을 확인할 수 없습니다: {first_line}")
    return match.group("committee"), match.group("member")


def parse_due_date(line: str) -> str:
    match = re.search(r"제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.", line)
    if not match:
        raise ValueError(f"제출기한 형식을 확인할 수 없습니다: {line}")
    year, month, day = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def expected_count_from_name(file_name: str) -> int | None:
    match = re.search(r"_(\d+)문항\.pdf$", file_name)
    return int(match.group(1)) if match else None


def should_skip_line(line: str) -> bool:
    return line.startswith("수신:") or line.startswith("담당 보좌관:") or line == "끝."


def parse_pdf(pdf_path: Path) -> tuple[list[Item], list[str]]:
    lines = read_pdf_lines(pdf_path)
    if len(lines) < 2:
        raise ValueError(f"내용이 너무 적습니다: {pdf_path.name}")

    committee, member = parse_header(lines[0])
    due_date = next((parse_due_date(line) for line in lines if line.startswith("수신:")), "")
    if not due_date:
        raise ValueError(f"제출기한 줄이 없습니다: {pdf_path.name}")

    items: list[Item] = []
    current: Item | None = None

    for line in lines[1:]:
        if should_skip_line(line):
            continue

        number_match = re.match(r"^(\d+)\.\s*(.*)$", line)
        if number_match:
            if current is not None:
                items.append(current)
            current = Item(
                file_name=pdf_path.name,
                committee=committee,
                member=member,
                due_date=due_date,
                number=int(number_match.group(1)),
            )
            text = number_match.group(2).strip()
            if text:
                current.request_lines.append(text)
                current.original_lines.append(line)
            continue

        if current is None:
            continue

        current.original_lines.append(line)

        detail_match = re.match(r"^([가-하])\.\s*(.*)$", line)
        if detail_match:
            current.detail_lines.append(f"{detail_match.group(1)}. {detail_match.group(2).strip()}".strip())
            current.last_part = "detail"
            continue

        if line.startswith("※"):
            current.note_lines.append(line.removeprefix("※").strip())
            current.last_part = "note"
            continue

        current.add_continuation(line)

    if current is not None:
        items.append(current)

    return items, lines


def is_consecutive(numbers: list[int]) -> bool:
    return numbers == list(range(1, len(numbers) + 1))


def write_csv(items: list[Item]) -> None:
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["파일명", "위원회", "의원", "제출기한", "문항번호", "요구내용", "세부항목", "비고"]
    with OUTPUT_FILE.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for item in items:
            writer.writerow(item.row())


def make_report(items_by_file: dict[str, list[Item]]) -> list[str]:
    lines: list[str] = []
    lines.append("파일명 | 파일명의 문항 수 | 뽑은 문항 수 | 마지막 번호 | 번호 연속 | 일치(O/X)")
    lines.append("---|---:|---:|---:|---|---")

    for file_name, items in items_by_file.items():
        expected = expected_count_from_name(file_name)
        numbers = [item.number for item in items]
        last_number = numbers[-1] if numbers else 0
        consecutive = is_consecutive(numbers)
        matched = expected == len(items) == last_number and consecutive
        lines.append(
            f"{file_name} | {expected if expected is not None else ''} | {len(items)} | "
            f"{last_number} | {'O' if consecutive else 'X'} | {'O' if matched else 'X'}"
        )

    sample_items = [
        item
        for items in items_by_file.values()
        for item in items
        if item.detail_lines or item.note_lines
    ][:3]

    lines.append("")
    lines.append("세부항목·비고가 있는 문항 3개 원문 대조")
    lines.append("파일명 | 문항번호 | 원문 PDF에서 뽑은 줄 | CSV 저장 내용")
    lines.append("---|---:|---|---")
    for item in sample_items:
        row = item.row()
        original = "<br>".join(item.original_lines)
        saved_parts = [
            f"요구내용: {row['요구내용']}",
            f"세부항목: {row['세부항목'] or '-'}",
            f"비고: {row['비고'] or '-'}",
        ]
        saved = "<br>".join(part.replace("\n", "<br>") for part in saved_parts)
        lines.append(f"{item.file_name} | {item.number} | {original} | {saved}")

    return lines


def main() -> None:
    pdf_paths = sorted(SOURCE_DIR.glob("*.pdf"))
    if len(pdf_paths) != 3:
        raise SystemExit(f"원문 PDF는 3건이어야 합니다. 현재 {len(pdf_paths)}건입니다.")

    all_items: list[Item] = []
    items_by_file: dict[str, list[Item]] = {}
    for pdf_path in pdf_paths:
        items, _ = parse_pdf(pdf_path)
        items_by_file[pdf_path.name] = items
        all_items.extend(items)

    write_csv(all_items)
    print(f"저장: {OUTPUT_FILE}")
    print()
    print("\n".join(make_report(items_by_file)))


if __name__ == "__main__":
    main()
