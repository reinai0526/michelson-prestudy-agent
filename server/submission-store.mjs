import fs from "node:fs";
import path from "node:path";

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key, enabled: Boolean(url && key) };
}

export function getStorageMode() {
  return getSupabaseConfig().enabled ? "supabase" : "server-file";
}

function supabaseHeaders(extra = {}) {
  const { key } = getSupabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function parseSupabaseResponse(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = result?.message || result?.hint || `HTTP ${response.status}`;
    throw new Error(`云端学情库请求失败：${details}`);
  }
  return result;
}

function rowToSubmission(row) {
  return {
    submissionKey: row.submission_key,
    state: row.payload?.state || {},
    extensionState: row.payload?.extensionState,
    firstSubmittedAt: row.first_submitted_at,
    updatedAt: row.updated_at
  };
}

async function upsertSupabase(submission) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/student_submissions?on_conflict=submission_key`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify({
      submission_key: submission.submissionKey,
      student_name: submission.state.studentName,
      student_id: submission.state.studentId || "",
      class_name: submission.state.className || "",
      payload: { state: submission.state, extensionState: submission.extensionState },
      updated_at: submission.updatedAt
    })
  });
  const rows = await parseSupabaseResponse(response);
  return rowToSubmission(rows[0]);
}

async function listSupabase() {
  const { url } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/student_submissions?select=submission_key,payload,first_submitted_at,updated_at&order=updated_at.desc`,
    { headers: supabaseHeaders() }
  );
  const rows = await parseSupabaseResponse(response);
  return rows.map(rowToSubmission);
}

let fileQueue = Promise.resolve();

function getDataFile() {
  return process.env.SUBMISSION_DATA_FILE || path.join(process.cwd(), "runtime-data", "student-submissions.json");
}

async function withFileQueue(operation) {
  const result = fileQueue.then(operation, operation);
  fileQueue = result.catch(() => undefined);
  return result;
}

function readFileRows() {
  const dataFile = getDataFile();
  if (!fs.existsSync(dataFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFileRows(rows) {
  const dataFile = getDataFile();
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tempFile, dataFile);
}

async function upsertFile(submission) {
  return withFileQueue(() => {
    const rows = readFileRows();
    const index = rows.findIndex((item) => item.submissionKey === submission.submissionKey);
    const next = {
      ...submission,
      firstSubmittedAt: index >= 0 ? rows[index].firstSubmittedAt : submission.updatedAt
    };
    if (index >= 0) rows[index] = next;
    else rows.push(next);
    writeFileRows(rows);
    return next;
  });
}

async function listFile() {
  return withFileQueue(() => readFileRows().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
}

export async function upsertSubmission(submission) {
  return getSupabaseConfig().enabled ? upsertSupabase(submission) : upsertFile(submission);
}

export async function listSubmissions() {
  return getSupabaseConfig().enabled ? listSupabase() : listFile();
}
