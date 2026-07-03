import type { StudyState } from "../types";

const STORAGE_KEY = "michelson-prestudy-state-v1";

export const initialStudyState: StudyState = {
  studentName: "",
  currentIndex: 0,
  records: {},
  wrongBook: [],
  practiceMode: "all"
};

export function loadStudyState(): StudyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialStudyState;
    return { ...initialStudyState, ...JSON.parse(raw) };
  } catch {
    return initialStudyState;
  }
}

export function saveStudyState(state: StudyState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearStudyState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function makeDemoState(): StudyState {
  return {
    studentName: "演示学生 2026",
    currentIndex: 12,
    practiceMode: "all",
    completedAt: new Date().toISOString(),
    wrongBook: ["C05", "C06", "J04", "S02", "S03", "S07"],
    records: {
      C01: demo("C01", "B", true, 1, 1),
      C02: demo("C02", "A", true, 1, 1),
      C03: demo("C03", "B", true, 1, 1),
      C04: demo("C04", "A", true, 1, 1),
      C05: demo("C05", "A", false, 2, 0),
      C06: demo("C06", "B", false, 2, 0),
      C07: demo("C07", "A", true, 1, 1),
      C08: demo("C08", "B", true, 1, 1),
      C09: demo("C09", "C", true, 1, 1),
      C10: demo("C10", "B", true, 1, 1),
      J01: demo("J01", "true", true, 1, 1),
      J02: demo("J02", "false", true, 1, 1),
      J03: demo("J03", "true", true, 1, 1),
      J04: demo("J04", "true", false, 2, 0),
      S01: demo("S01", "分光板分成两束，经两个镜子反射后回到 G1 合成，在屏上形成干涉。", true, 1, 0.8),
      S02: demo("S02", "补偿板让光程一样，撤去后条纹会变差。", false, 2, 0.35),
      S03: demo("S03", "可动镜移动后光程改变，所以 lambda=2dx/N。", false, 2, 0.42, true)
    }
  };
}

function demo(questionId: string, answer: string, isCorrect: boolean, attempts: number, keywordCoverage: number, viewedReference = false) {
  return {
    questionId,
    answer,
    firstAnswer: answer,
    isCorrect,
    attempts,
    viewedReference,
    keywordCoverage,
    missingPoints: [],
    mentionedPoints: [],
    mistakeTypes: isCorrect ? [] : ["概念不完整"],
    feedback: isCorrect ? "演示数据：回答正确。" : "演示数据：该题存在概念薄弱点。",
    updatedAt: new Date().toISOString()
  };
}
