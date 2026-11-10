const fs = require("fs");
const path = require("path");

const root = __dirname;
const inputPath = path.join(root, "data", "A부_조직도_26개과.csv");
const outputPath = path.join(root, "org.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

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

function toObjects(rows) {
  const [header, ...body] = rows;
  const index = Object.fromEntries(header.map((name, i) => [name.trim(), i]));

  return body.map((row) => ({
    실국: (row[index["실국"]] || "").trim(),
    과: (row[index["과"]] || "").trim(),
    대표키워드: (row[index["대표키워드"]] || "")
      .split("|")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  }));
}

const csvText = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const org = toObjects(parseCsv(csvText));

fs.writeFileSync(outputPath, `${JSON.stringify(org, null, 2)}\n`, "utf8");

console.log(`원소 수: ${org.length}`);
console.log("첫 원소:");
console.log(JSON.stringify(org[0], null, 2));
