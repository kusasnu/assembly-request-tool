const fs = require("fs");
const path = require("path");
const engine = require("./web/engine.js");

const testPath = path.join(__dirname, "data", "시험_요구문항_40건.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  const cleanText = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < cleanText.length; i += 1) {
    const char = cleanText[i];
    const next = cleanText[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  const header = rows[0].map((name) => name.trim());
  return rows.slice(1).map((row) => {
    const object = {};
    header.forEach((name, index) => {
      object[name] = (row[index] || "").trim();
    });
    return object;
  });
}

function formatResult(candidates) {
  if (candidates.length === 0) {
    return "없음";
  }
  return candidates
    .map((candidate) => `${candidate.과}(${candidate.점수}, ${candidate.근거키워드.join("/")})`)
    .join(" / ");
}

async function main() {
  await engine.ready;

  const rows = csvToObjects(fs.readFileSync(testPath, "utf8"));
  let topCorrect = 0;
  let topThreeCorrect = 0;
  const wrongRows = [];

  for (const row of rows) {
    const candidates = engine.classify(row["요구내용"]);
    const departments = candidates.map((candidate) => candidate.과);
    const answer = row["정답_배분과"];

    if (departments[0] === answer) {
      topCorrect += 1;
    }
    if (departments.includes(answer)) {
      topThreeCorrect += 1;
    }
    if (departments[0] !== answer) {
      wrongRows.push({
        시험번호: row["시험번호"],
        요구내용: row["요구내용"],
        정답: answer,
        엔진결과: formatResult(candidates),
      });
    }
  }

  console.log(`1순위 정답 ${topCorrect}/${rows.length} · 3순위 안 ${topThreeCorrect}/${rows.length}`);
  console.log("");
  console.log("틀린 문항 표");
  console.log("시험번호 | 요구내용 | 정답 | 엔진 결과");
  console.log("---|---|---|---");
  for (const row of wrongRows) {
    console.log(`${row.시험번호} | ${row.요구내용} | ${row.정답} | ${row.엔진결과}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
