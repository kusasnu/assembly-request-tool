"""요구 문항의 소관 과를 배분기준표 CSV로 추천하는 간단한 함수.

코드에는 배분 규칙을 직접 쓰지 않고, data 폴더의 조직도와 배분기준표를 읽는다.
단독 실행하면 data/시험_요구문항_40건.csv로 1순위 정답 수를 출력한다.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
ORG_PATH = BASE_DIR / "data" / "A부_조직도_26개과.csv"
RULE_PATH = BASE_DIR / "data" / "배분기준표_소관키워드_304건.csv"
TEST_PATH = BASE_DIR / "data" / "시험_요구문항_40건.csv"
QUESTION_PATH = BASE_DIR / "data" / "문항목록.csv"
LEDGER_PATH = BASE_DIR / "data" / "요구자료_접수대장_2026국감_520건.csv"
CASES_PATH = BASE_DIR / "cases.json"


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _split_terms(value: str) -> list[str]:
    return [term.strip() for term in (value or "").split("|") if term.strip()]


def _load_org_departments() -> set[str]:
    rows = _read_csv(ORG_PATH)
    return {row["과"].strip() for row in rows if row.get("과", "").strip()}


def _load_rules(valid_departments: set[str]) -> list[dict[str, object]]:
    rules: list[dict[str, object]] = []
    for row in _read_csv(RULE_PATH):
        department = row.get("과", "").strip()
        keyword = row.get("키워드", "").strip()
        if not department or not keyword:
            continue
        if department not in valid_departments:
            continue
        rules.append(
            {
                "rule_id": row.get("rule_id", "").strip(),
                "type": row.get("유형", "").strip(),
                "department": department,
                "keyword": keyword,
                "exclude_terms": _split_terms(row.get("제외어", "")),
                "priority": int(row.get("우선순위", "0") or 0),
            }
        )
    return rules


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value or "")


def _candidate_rows(matched_rules: list[dict[str, object]], limit: int = 3) -> list[dict[str, object]]:
    by_department: dict[str, dict[str, object]] = {}
    for rule in matched_rules:
        department = str(rule["department"])
        candidate = by_department.setdefault(
            department,
            {
                "과": department,
                "배분구분": str(rule["type"]),
                "우선순위": int(rule["priority"]),
                "근거키워드": [],
                "규칙": [],
            },
        )
        candidate["우선순위"] = max(int(candidate["우선순위"]), int(rule["priority"]))
        candidate["근거키워드"].append(str(rule["keyword"]))
        candidate["규칙"].append(str(rule["rule_id"]))

    candidates = list(by_department.values())
    for candidate in candidates:
        candidate["근거키워드"] = sorted(set(candidate["근거키워드"]))
        candidate["규칙"] = sorted(set(candidate["규칙"]))

    candidates.sort(key=lambda item: (-int(item["우선순위"]), str(item["과"])))
    return candidates[:limit]


def recommend_department(question: str) -> dict[str, object]:
    """요구 문항 1개를 받아 소관 과 후보를 돌려준다.

    반환값:
    - status: "추천" 또는 "확인필요"
    - top_department: 1순위 과 이름. 동순위·미일치이면 "확인필요"
    - candidates: 후보 과 목록
    - matched_rules: 적용된 규칙 목록
    """

    text = (question or "").strip()
    valid_departments = _load_org_departments()
    rules = _load_rules(valid_departments)

    matched: list[dict[str, object]] = []
    for rule in rules:
        keyword = str(rule["keyword"])
        if keyword not in text:
            continue
        exclude_terms = list(rule["exclude_terms"])
        if any(term in text for term in exclude_terms):
            continue
        matched.append(rule)

    if not matched:
        return {
            "status": "확인필요",
            "top_department": "확인필요",
            "candidates": [],
            "matched_rules": [],
        }

    best_priority = max(int(rule["priority"]) for rule in matched)
    best_rules = [rule for rule in matched if int(rule["priority"]) == best_priority]
    best_departments = sorted({str(rule["department"]) for rule in best_rules})

    matched_rules = [
        {
            "rule_id": str(rule["rule_id"]),
            "type": str(rule["type"]),
            "department": str(rule["department"]),
            "keyword": str(rule["keyword"]),
            "priority": int(rule["priority"]),
        }
        for rule in matched
    ]
    matched_rules.sort(key=lambda item: (-int(item["priority"]), item["department"], item["keyword"]))
    candidates = _candidate_rows(matched_rules)

    if len(best_departments) != 1:
        return {
            "status": "확인필요",
            "top_department": "확인필요",
            "candidates": best_departments,
            "candidate_details": candidates,
            "matched_rules": matched_rules,
        }

    return {
        "status": "추천",
        "top_department": best_departments[0],
        "candidates": [str(candidate["과"]) for candidate in candidates],
        "candidate_details": candidates,
        "matched_rules": matched_rules,
    }


def _load_past_history() -> dict[str, list[dict[str, str]]]:
    history: dict[str, list[dict[str, str]]] = {}
    if not LEDGER_PATH.exists():
        return history

    for row in _read_csv(LEDGER_PATH):
        key = _normalize_text(row.get("요구내용", ""))
        if not key:
            continue
        history.setdefault(key, []).append(
            {
                "접수번호": row.get("접수번호", ""),
                "접수일": row.get("접수일", ""),
                "위원회": row.get("위원회", ""),
                "요구의원": row.get("요구의원", ""),
                "문항번호": row.get("문항번호", ""),
                "배분구분": row.get("배분구분", ""),
                "배분과": row.get("배분과", ""),
                "처리상태": row.get("처리상태", ""),
            }
        )

    for rows in history.values():
        rows.sort(key=lambda row: row["접수일"], reverse=True)
    return history


def _make_case_id(row: dict[str, str]) -> str:
    member = row["의원"].replace(" ", "")
    number = int(row["문항번호"])
    return f"{member}-{number:02d}"


def build_cases() -> list[dict[str, object]]:
    past_history = _load_past_history()
    cases: list[dict[str, object]] = []

    for row in _read_csv(QUESTION_PATH):
        question_text = row["요구내용"]
        result = recommend_department(question_text)
        history = past_history.get(_normalize_text(question_text), [])
        top_department = result["top_department"] if result["status"] == "추천" else ""

        cases.append(
            {
                "id": _make_case_id(row),
                "파일명": row["파일명"],
                "위원회": row["위원회"],
                "의원": row["의원"],
                "제출기한": row["제출기한"],
                "문항번호": row["문항번호"],
                "요구내용": row["요구내용"],
                "세부항목": row["세부항목"],
                "비고": row["비고"],
                "상태": "접수",
                "주관과": "",
                "협조과": [],
                "확정방법": "",
                "추천상태": str(result["status"]),
                "추천주관과": top_department,
                "후보": result.get("candidate_details", []),
                "과거이력": {
                    "건수": len(history),
                    "최근": history[:5],
                },
                "과별회신": [],
                "재배정": [],
                "보완": [],
                "확정코멘트": "",
                "log": [
                    {
                        "일시": "",
                        "작업": "문항분해",
                        "문항": _make_case_id(row),
                        "과": "",
                    }
                ],
            }
        )

    return cases


def write_cases() -> list[dict[str, object]]:
    cases = build_cases()
    with CASES_PATH.open("w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return cases


def run_test() -> tuple[int, int]:
    rows = _read_csv(TEST_PATH)
    correct = 0
    for row in rows:
        result = recommend_department(row["요구내용"])
        if result["top_department"] == row["정답_배분과"].strip():
            correct += 1
    return correct, len(rows)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cases":
        case_rows = write_cases()
        need_check = sum(1 for row in case_rows if row["추천상태"] == "확인필요")
        print(f"만든 파일: {CASES_PATH}")
        print(f"문항 수: {len(case_rows)}")
        print(f"확인필요: {need_check}")
    else:
        correct_count, total_count = run_test()
        print(f"1순위 정답 수: {correct_count}/{total_count}")
        print(f"만든 파일: {Path(__file__).name}")
