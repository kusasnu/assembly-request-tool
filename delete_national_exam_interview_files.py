"""파일명에 '국가공무원 면접'이 들어간 파일을 찾고, 선택적으로 삭제한다.

기본 실행은 삭제하지 않고 대상만 보여 준다.
실제로 삭제하려면 `--delete`를 붙인다.
"""

from __future__ import annotations

import argparse
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
TARGET_PHRASE = "국가공무원 면접"


def normalize_name(value: str) -> str:
    """공백·밑줄·붙임표 차이를 무시하고 비교한다."""

    return (
        value.replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace("·", "")
        .lower()
    )


def find_target_files(root: Path) -> list[Path]:
    needle = normalize_name(TARGET_PHRASE)
    targets: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name == Path(__file__).name:
            continue
        if needle in normalize_name(path.name):
            targets.append(path)
    return sorted(targets)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="파일명에 '국가공무원 면접'이 들어간 파일을 찾고 삭제한다."
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="대상 파일을 실제로 삭제한다. 없으면 목록만 보여 준다.",
    )
    args = parser.parse_args()

    targets = find_target_files(BASE_DIR)
    if not targets:
        print("대상 파일이 없습니다.")
        return

    print("대상 파일:")
    for path in targets:
        print(f"- {path}")

    if not args.delete:
        print("\n삭제하지 않았습니다. 실제 삭제하려면 --delete를 붙여 실행하세요.")
        return

    for path in targets:
        path.unlink()
    print(f"\n삭제 완료: {len(targets)}개")


if __name__ == "__main__":
    main()
