import type { ExtensionLearningState, StudentSubmission, StudyState } from "../types";

const submissionKeyStorageKey = "michelson-submission-key-v1";
const teacherCodeSessionKey = "michelson-teacher-code-session-v1";

function makeSubmissionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `student-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getSubmissionKey() {
  try {
    const saved = localStorage.getItem(submissionKeyStorageKey);
    if (saved) return saved;
    const next = makeSubmissionKey();
    localStorage.setItem(submissionKeyStorageKey, next);
    return next;
  } catch {
    return makeSubmissionKey();
  }
}

export async function syncStudentProgress(state: StudyState, extensionState: ExtensionLearningState) {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionKey: getSubmissionKey(), state, extensionState })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "学习数据同步失败");
  return result as { ok: true; updatedAt: string; storage: string };
}

export function loadSavedTeacherCode() {
  try {
    return sessionStorage.getItem(teacherCodeSessionKey) || "";
  } catch {
    return "";
  }
}

export function saveTeacherCode(code: string) {
  try {
    sessionStorage.setItem(teacherCodeSessionKey, code);
  } catch {
    // Session persistence is optional; the current page can still use the code.
  }
}

export function clearSavedTeacherCode() {
  try {
    sessionStorage.removeItem(teacherCodeSessionKey);
  } catch {
    // Ignore unavailable session storage.
  }
}

async function teacherRequest(path: string, code: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "X-Teacher-Code": code
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "教师端数据请求失败");
  return result;
}

export async function fetchTeacherSubmissions(code: string) {
  const result = await teacherRequest("/api/teacher/submissions", code);
  return result as { ok: true; submissions: StudentSubmission[]; storage: string };
}
