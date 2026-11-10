(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(true);
  } else {
    root.requestClassifyEngine = factory(false);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (isNode) {
  const RULE_PATH = "data/배분기준표_소관키워드_304건.csv";
  const ORG_PATH = "data/A부_조직도_26개과.csv";

  let rules = [];
  let departments = new Set();
  let ready = null;

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
    if (rows.length === 0) {
      return [];
    }

    const header = rows[0].map((name) => name.trim());
    return rows.slice(1).map((row) => {
      const object = {};
      header.forEach((name, index) => {
        object[name] = (row[index] || "").trim();
      });
      return object;
    });
  }

  function splitTerms(value) {
    return String(value || "")
      .split("|")
      .map((term) => term.trim())
      .filter(Boolean);
  }

  function loadFromText(ruleCsvText, orgCsvText) {
    const orgRows = csvToObjects(orgCsvText);
    departments = new Set(orgRows.map((row) => row["과"]).filter(Boolean));

    rules = csvToObjects(ruleCsvText)
      .map((row) => ({
        ruleId: row["rule_id"],
        department: row["과"],
        keyword: row["키워드"],
        excludeTerms: splitTerms(row["제외어"]),
        priority: Number(row["우선순위"] || 0),
      }))
      .filter((rule) => rule.department && rule.keyword && departments.has(rule.department));

    return { rulesCount: rules.length, departmentsCount: departments.size };
  }

  async function loadFromFetch() {
    const [ruleResponse, orgResponse] = await Promise.all([fetch(RULE_PATH), fetch(ORG_PATH)]);
    if (!ruleResponse.ok) {
      throw new Error(`배분기준표를 읽지 못했습니다: ${ruleResponse.status}`);
    }
    if (!orgResponse.ok) {
      throw new Error(`조직도를 읽지 못했습니다: ${orgResponse.status}`);
    }
    return loadFromText(await ruleResponse.text(), await orgResponse.text());
  }

  function loadFromNode() {
    const fs = require("fs");
    const path = require("path");
    const webDataDir = path.join(__dirname, "data");
    const rootDataDir = path.resolve(__dirname, "..", "data");
    const dataDir = fs.existsSync(webDataDir) ? webDataDir : rootDataDir;
    const ruleCsvText = fs.readFileSync(path.join(dataDir, "배분기준표_소관키워드_304건.csv"), "utf8");
    const orgCsvText = fs.readFileSync(path.join(dataDir, "A부_조직도_26개과.csv"), "utf8");
    return loadFromText(ruleCsvText, orgCsvText);
  }

  function ensureLoaded() {
    if (rules.length === 0 || departments.size === 0) {
      throw new Error("분류 엔진 자료가 아직 로드되지 않았습니다.");
    }
  }

  function classify(requestText) {
    ensureLoaded();

    const text = String(requestText || "");
    const byDepartment = new Map();

    for (const rule of rules) {
      if (!text.includes(rule.keyword)) {
        continue;
      }
      if (rule.excludeTerms.some((term) => text.includes(term))) {
        continue;
      }

      const score = rule.priority + rule.keyword.length / 10;
      const current = byDepartment.get(rule.department) || {
        과: rule.department,
        점수: 0,
        근거키워드: [],
      };

      current.점수 = Math.max(current.점수, score);
      if (!current.근거키워드.includes(rule.keyword)) {
        current.근거키워드.push(rule.keyword);
      }
      byDepartment.set(rule.department, current);
    }

    return Array.from(byDepartment.values())
      .map((candidate) => ({
        과: candidate.과,
        점수: Number(candidate.점수.toFixed(2)),
        근거키워드: candidate.근거키워드.sort((a, b) => b.length - a.length || a.localeCompare(b, "ko")),
      }))
      .sort((a, b) => b.점수 - a.점수 || a.과.localeCompare(b.과, "ko"))
      .slice(0, 3);
  }

  if (isNode) {
    ready = Promise.resolve(loadFromNode());
  } else if (typeof fetch === "function") {
    ready = loadFromFetch();
  } else {
    ready = Promise.reject(new Error("브라우저 fetch를 사용할 수 없습니다."));
  }

  return {
    classify,
    csvToObjects,
    getDepartments: () => Array.from(departments).sort((a, b) => a.localeCompare(b, "ko")),
    loadFromText,
    ready,
  };
});
