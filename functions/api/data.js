// Cloudflare Pages Function: GET /api/data
// 环境变量 (Settings > Variables and Secrets):
//   SHEET_CSV_URL  必填  Google Sheet 发布为 CSV 的链接
//   ID_SALT        选填  随便一串字符，用来给身份证做哈希

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toUpperCase();

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

export async function onRequestGet({ env }) {
  if (!env.SHEET_CSV_URL) {
    return Response.json({ error: "SHEET_CSV_URL 未设置" }, { status: 500 });
  }
  const res = await fetch(env.SHEET_CSV_URL, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) {
    return Response.json({ error: "无法读取 Google Sheet" }, { status: 502 });
  }
  const table = parseCSV(await res.text());
  const salt = env.ID_SALT || "";
  const records = [];

  // 第 1 行是标题，从第 2 行开始
  for (const r of table.slice(1)) {
    const [index, contest, name, ic, kelas, achievement, kebenaran, pengiktirafan, pelibatan, peringkat] =
      r.map((x) => (x || "").trim());
    if (!name || !kelas) continue;
    const icDigits = ic.replace(/\D/g, "");
    records.push({
      // 身份证不会送到浏览器，只送哈希(用来区分同名同班的人)和后4位
      pid: await sha(salt + (icDigits || norm(name))),
      ic4: icDigits.slice(-4),
      kelas: norm(kelas),
      name: norm(name),
      index, contest, achievement, kebenaran, pengiktirafan, pelibatan, peringkat,
    });
  }

  return Response.json(records, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
