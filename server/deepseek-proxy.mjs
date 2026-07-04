import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

loadLocalEnv(path.join(root, ".env.local"));

const PORT = Number(process.env.PORT || process.env.DEEPSEEK_PROXY_PORT || 8787);
const HOST =
  process.env.HOST ||
  process.env.DEEPSEEK_PROXY_HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const DIST_DIR = path.join(root, "dist");
const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(text);
}

function sendFile(request, response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const baseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    "Accept-Ranges": "bytes"
  };
  const range = request.headers.range;

  // 浏览器和微信内置浏览器播放 MP4 时通常会发 Range 请求，
  // 必须返回 206 分段内容，否则公开视频容易一直加载或黑屏。
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stat.size}` });
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
      response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stat.size}` });
      response.end();
      return;
    }
    const boundedEnd = Math.min(end, stat.size - 1);
    response.writeHead(206, {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${boundedEnd}/${stat.size}`,
      "Content-Length": boundedEnd - start + 1
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath, { start, end: boundedEnd }).pipe(response);
    return;
  }

  response.writeHead(200, {
    ...baseHeaders,
    "Content-Length": stat.size
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

function serveStatic(request, response) {
  if (!fs.existsSync(DIST_DIR)) {
    sendText(response, 404, "尚未生成网页文件。请先运行 npm run build，或直接运行 npm run share。");
    return;
  }
  const url = new URL(request.url || "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(DIST_DIR, requestedPath));
  if (!filePath.startsWith(DIST_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(request, response, filePath);
    return;
  }
  sendFile(request, response, path.join(DIST_DIR, "index.html"));
}

function getLanUrls(port) {
  return Object.values(os.networkInterfaces())
    .flatMap((items) => items || [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function buildMessages(question, sources, kind, mode = "classroom", directionTitle = "", directionKeywords = []) {
  const evidence = sources
    .map((source, index) => {
      const page = source.page ? `第 ${source.page} 页` : "无页码";
      return `[${index + 1}] 文件：${source.source}；位置：${page}；片段：${source.snippet}`;
    })
    .join("\n\n");

  const format =
    mode === "practice"
      ? "请只返回 JSON 数组，不要使用 Markdown。数组中每个对象包含 type、question、options、correctAnswer、explanation、keywords、requiredPoints 字段。type 只能是 choice、judgement 或 short。choice 的 options 为 A-D 四个选项。"
      : mode === "extension"
      ? "请围绕当前拓展方向回答。普通理解类问题按“简要回答—原理解释—与迈克耳孙干涉仪的联系—实验实现思路—注意事项或易错点”的结构回答；如果学生问实验设计问题，请按“实验目标—可行方案—关键测量量—数据处理方法—可能误差来源”的结构回答。"
      : kind === "operation"
        ? "请按“现象判断—可能原因—调节建议—注意事项”的结构回答。"
        : kind === "data"
          ? "请按“计算思路—使用公式—结果判断—误差来源提醒”的结构回答。"
          : "请按“简要回答—原理解释—关键公式—易错点提醒”的结构回答。";

  return [
    {
      role: "system",
      content:
        "你是大学物理实验课程的智能助教，主题是迈克耳孙干涉仪及激光波长测量。" +
        (mode === "extension" ? `当前学生正在学习拓展方向：${directionTitle}。关键词：${directionKeywords.join("、")}。回答必须围绕该拓展方向展开。` : "") +
        (mode === "practice" ? `当前需要为薄弱知识点“${directionTitle}”生成个性化巩固题。题目必须改变题干和考查角度，不能重复原题。` : "") +
        "必须优先依据用户提供的资料片段回答，不能编造论文、页码或数据。" +
        "如果资料片段不足以支持结论，请明确说“当前资料库中未检索到充分依据”。" +
        "回答要适合本科实验教学，语言清晰、步骤具体、公式单位准确。" +
        "不要输出资料编号、文献编号、页码列表或“参见资料[3]”这类学生不易理解的表达。" +
        "不要在回答开头声明“本回答已参考课程资料库内容生成”，也不要显得像文档摘录；请直接以智能助教身份回答学生问题。" +
        (mode === "practice" ? "必须返回可解析 JSON，不要解释。" : "公式请使用 Markdown 数学格式：行内公式用 $...$，独立公式用 $$...$$。")
    },
    {
      role: "user",
      content: `学生问题：${question}\n\n后台检索到的课程资料片段如下，仅供你生成回答时参考，不要在学生端逐条列出，也不要说明你检索了资料：\n${evidence}\n\n${format}\n请直接回答问题，开头使用对应结构标题。`
    }
  ];
}

async function callDeepSeek({ question, sources, kind, mode, directionTitle, directionKeywords }) {
  if (!API_KEY) {
    return {
      ok: false,
      status: 401,
      message: "未配置 DEEPSEEK_API_KEY。请在项目根目录创建 .env.local，或在终端中设置环境变量。"
    };
  }
  if (!Array.isArray(sources) || sources.length < 2) {
    return {
      ok: false,
      status: 422,
      message: "当前资料库中未检索到充分依据。"
    };
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: buildMessages(question, sources, kind, mode, directionTitle, directionKeywords),
      temperature: 0.2,
      stream: false
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: data?.error?.message || `DeepSeek API 请求失败：HTTP ${response.status}`
    };
  }

  return {
    ok: true,
    answer: data?.choices?.[0]?.message?.content || "DeepSeek 未返回有效文本。",
    model: data?.model || MODEL,
    usage: data?.usage
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      model: MODEL,
      baseUrl: BASE_URL,
      hasApiKey: Boolean(API_KEY)
    });
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/deepseek-chat") {
    sendJson(response, 404, { ok: false, message: "Not found" });
    return;
  }

  try {
    const body = JSON.parse(await readBody(request));
    const question = String(body.question || "").trim();
    const sources = body.sources || [];
    const kind = body.kind || "theory";
    const mode = body.mode || "classroom";
    const directionTitle = body.directionTitle || "";
    const directionKeywords = body.directionKeywords || [];
    if (!question) {
      sendJson(response, 400, { ok: false, message: "问题不能为空。" });
      return;
    }
    const result = await callDeepSeek({ question, sources, kind, mode, directionTitle, directionKeywords });
    sendJson(response, result.ok ? 200 : result.status || 500, result);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message: error instanceof Error ? error.message : "DeepSeek proxy error"
    });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`Michelson agent listening on http://${displayHost}:${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`API key configured: ${API_KEY ? "yes" : "no"}`);
  if (HOST === "0.0.0.0") {
    const urls = getLanUrls(PORT);
    console.log("Share mode URLs:");
    if (urls.length) {
      urls.forEach((url) => console.log(`  ${url}`));
    } else {
      console.log(`  http://你的电脑IP:${PORT}`);
    }
  }
});
