(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AppCommon = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "assembly-request-cases";

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
    if (!rows.length) {
      return [];
    }
    const header = rows[0].map((name) => name.trim());
    return rows.slice(1).map((row) => {
      const item = {};
      header.forEach((name, index) => {
        item[name] = (row[index] || "").trim();
      });
      return item;
    });
  }

  async function loadText(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} 파일을 읽지 못했습니다.`);
    }
    return response.text();
  }

  async function loadCsv(url) {
    return csvToObjects(await loadText(url));
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, "utf-8");
    });
  }

  function loadCases() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveCases(cases) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases, null, 2));
  }

  function clearCases() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function makeCaseId(item) {
    return `${item["파일명"] || "요구서"}-${String(item["문항번호"]).padStart(2, "0")}`;
  }

  function toCase(item, classify) {
    const candidates = classify ? classify(item["요구내용"]) : [];
    return {
      id: makeCaseId(item),
      파일명: item["파일명"] || "",
      위원회: item["위원회"] || "",
      의원: item["의원"] || "",
      제출기한: item["제출기한"] || "",
      문항번호: String(item["문항번호"] || ""),
      요구내용: item["요구내용"] || "",
      세부항목: item["세부항목"] || "",
      비고: item["비고"] || "",
      상태: "접수",
      후보: candidates,
      주관과: candidates[0]?.과 || "",
      협조과: [],
      확정방법: "",
      확정일시: "",
    };
  }

  function mergeCases(currentCases, newCases) {
    const byId = new Map(currentCases.map((item) => [item.id, item]));
    for (const item of newCases) {
      byId.set(item.id, { ...byId.get(item.id), ...item });
    }
    return Array.from(byId.values());
  }

  function countByStatus(cases) {
    return cases.reduce(
      (acc, item) => {
        acc.전체 += 1;
        acc[item.상태] = (acc[item.상태] || 0) + 1;
        return acc;
      },
      { 전체: 0 }
    );
  }

  function showReveal() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll("[data-reveal]").forEach((item) => item.classList.add("show"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          entry.target.classList.add("show");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.14 }
    );
    document.querySelectorAll("[data-reveal]").forEach((item) => io.observe(item));
  }

  return {
    STORAGE_KEY,
    clearCases,
    countByStatus,
    csvToObjects,
    loadCases,
    loadCsv,
    loadText,
    makeCaseId,
    mergeCases,
    parseCsv,
    readFileText,
    saveCases,
    showReveal,
    toCase,
  };
});
