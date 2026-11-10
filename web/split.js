(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RequestSplitter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeLine(line) {
    const compact = String(line || "").replace(/\s+/g, " ").trim();
    const tokens = compact.split(" ").filter(Boolean);
    const singleTokenCount = tokens.filter((token) => /^[가-힣A-Za-z0-9]$/.test(token)).length;
    if (tokens.length >= 6 && singleTokenCount / tokens.length >= 0.55) {
      return compact.replace(/\s+/g, "").replace(/^(\d+)\./, "$1. ");
    }
    return compact;
  }

  function parseHeader(firstLine) {
    const line = normalizeLine(firstLine);
    const match =
      line.match(/^(.+?위원회)\s+(.+?)\s+의원실\s+자료요구서$/) ||
      line.match(/^(.+?위원회)(.+?)의원실자료요구서$/);
    if (!match) {
      throw new Error(`첫 줄 형식을 확인할 수 없습니다: ${firstLine}`);
    }
    return { 위원회: match[1], 의원: match[2] };
  }

  function parseDueDate(line) {
    const match = normalizeLine(line).match(/제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
    if (!match) {
      throw new Error(`제출기한 형식을 확인할 수 없습니다: ${line}`);
    }
    return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  }

  function shouldSkipLine(line) {
    return line.startsWith("수신:") || line.startsWith("담당 보좌관:") || line === "끝.";
  }

  function addContinuation(item, text) {
    if (item._lastPart === "detail" && item._details.length) {
      item._details[item._details.length - 1] = `${item._details[item._details.length - 1]} ${text}`.trim();
    } else if (item._lastPart === "note" && item._notes.length) {
      item._notes[item._notes.length - 1] = `${item._notes[item._notes.length - 1]} ${text}`.trim();
    } else {
      item._requests.push(text);
      item._lastPart = "request";
    }
  }

  function toRow(item) {
    return {
      파일명: item.파일명,
      위원회: item.위원회,
      의원: item.의원,
      제출기한: item.제출기한,
      문항번호: String(item.문항번호),
      요구내용: item._requests.join(" ").trim(),
      세부항목: item._details.join(" / ").trim(),
      비고: item._notes.join(" / ").trim(),
    };
  }

  function parseText(text, fileName = "요구서.pdf") {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(normalizeLine)
      .filter(Boolean);
    if (lines.length < 2) {
      throw new Error(`${fileName}: 읽을 수 있는 내용이 너무 적습니다.`);
    }

    const header = parseHeader(lines[0]);
    const dueLine = lines.find((line) => line.startsWith("수신:"));
    if (!dueLine) {
      throw new Error(`${fileName}: 제출기한 줄이 없습니다.`);
    }
    const dueDate = parseDueDate(dueLine);

    const items = [];
    let current = null;

    for (const line of lines.slice(1)) {
      if (shouldSkipLine(line)) {
        continue;
      }

      const numberMatch = line.match(/^(\d+)\.\s*(.*)$/);
      if (numberMatch) {
        if (current) {
          items.push(toRow(current));
        }
        current = {
          파일명: fileName,
          위원회: header.위원회,
          의원: header.의원,
          제출기한: dueDate,
          문항번호: Number(numberMatch[1]),
          _requests: [],
          _details: [],
          _notes: [],
          _lastPart: "request",
        };
        if (numberMatch[2].trim()) {
          current._requests.push(numberMatch[2].trim());
        }
        continue;
      }

      if (!current) {
        continue;
      }

      const detailMatch = line.match(/^([가-하])\.\s*(.*)$/);
      if (detailMatch) {
        current._details.push(`${detailMatch[1]}. ${detailMatch[2].trim()}`.trim());
        current._lastPart = "detail";
        continue;
      }

      if (line.startsWith("※")) {
        current._notes.push(line.replace(/^※\s*/, "").trim());
        current._lastPart = "note";
        continue;
      }

      addContinuation(current, line);
    }

    if (current) {
      items.push(toRow(current));
    }
    return items;
  }

  function expectedCountFromFileName(fileName) {
    const match = String(fileName || "").match(/_(\d+)문항\.pdf$/);
    return match ? Number(match[1]) : null;
  }

  function checkByFile(items) {
    const grouped = new Map();
    for (const item of items) {
      const fileName = item.파일명 || "";
      if (!grouped.has(fileName)) {
        grouped.set(fileName, []);
      }
      grouped.get(fileName).push(item);
    }
    return Array.from(grouped.entries()).map(([fileName, rows]) => {
      const numbers = rows.map((row) => Number(row.문항번호));
      const expected = expectedCountFromFileName(fileName);
      const lastNumber = numbers[numbers.length - 1] || 0;
      const consecutive = numbers.every((number, index) => number === index + 1);
      return {
        파일명: fileName,
        파일명의문항수: expected,
        뽑은문항수: rows.length,
        마지막번호: lastNumber,
        번호연속: consecutive,
        일치: expected === null ? consecutive : expected === rows.length && expected === lastNumber && consecutive,
      };
    });
  }

  function pageItemsToLines(items) {
    const positioned = items
      .map((item) => ({
        text: normalizeLine(item.str),
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
      }))
      .filter((item) => item.text);

    positioned.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const item of positioned) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - item.y) < 3) {
        last.items.push(item);
      } else {
        lines.push({ y: item.y, items: [item] });
      }
    }
    return lines.map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
  }

  async function extractPdfText(file) {
    if (!globalThis.pdfjsLib) {
      throw new Error("pdf.js 파일을 찾지 못했습니다.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await globalThis.pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pageItemsToLines(content.items).join("\n"));
    }
    return pages.join("\n");
  }

  return {
    checkByFile,
    expectedCountFromFileName,
    extractPdfText,
    parseText,
  };
});
