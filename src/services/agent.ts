import { modules, questionBank } from "../data/questionBank";
import { personalizedPracticeQuestions } from "../data/personalizedPractice";
import type {
  AnswerRecord,
  LearningRecommendation,
  ModuleDiagnostic,
  Question,
  StudyState
} from "../types";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[，。；、！？,.!?;:：\s]/g, "")
    .replace(/[√✓]/g, "true")
    .replace(/[×✕x]/g, "false");

const pointHit = (answer: string, point: string, keywords: string[]) => {
  const pool = [point, ...keywords].map(normalize);
  const normalizedAnswer = normalize(answer);
  return pool.some((item) => item.length >= 2 && normalizedAnswer.includes(item.slice(0, Math.min(item.length, 8))));
};

export function generateHint(question: Question, attempt: number) {
  return question.hints[Math.min(attempt, question.hints.length - 1)] ?? question.explanation;
}

export function generateFollowUp(question: Question, missingPoints: string[]) {
  if (!missingPoints.length) return question.followUpQuestions[0] ?? "能否再用物理过程解释一次？";
  const lower = missingPoints.join(" ");
  if (lower.includes("去程") || lower.includes("回程") || lower.includes("往返")) {
    return "光到达可动镜后是停止传播，还是还要沿原路返回？镜面移动对去程和回程分别产生多大影响？";
  }
  if (lower.includes("补偿") || lower.includes("玻璃") || lower.includes("色散")) {
    return "两束光穿过玻璃的次数是否相同？补偿板要补偿的是空气路程，还是玻璃中的附加光程？";
  }
  if (lower.includes("初始") || lower.includes("变化量")) {
    return "如果移动前后级次分别是 k 和 k+N，作差后初始 k 还保留吗？";
  }
  return question.followUpQuestions[0] ?? "请再说出一个能支撑结论的物理理由。";
}

export function diagnoseAnswer(question: Question, rawAnswer: string, previous?: AnswerRecord): AnswerRecord {
  const answer = rawAnswer.trim();
  const attempts = (previous?.attempts ?? 0) + 1;
  const mistakeTypes: string[] = [];
  let isCorrect = false;
  let keywordCoverage = 0;
  let feedback = "";
  let mentionedPoints: string[] = [];
  let missingPoints: string[] = [];

  if (!answer) {
    feedback = "请先作答。迈小测会根据你的答案给出提示。";
  } else if (question.type === "choice" || question.type === "judgement") {
    const normalizedAnswer = normalize(answer);
    isCorrect = normalizedAnswer === normalize(question.correctAnswer ?? "");
    keywordCoverage = isCorrect ? 1 : 0;
    if (isCorrect) {
      feedback = `回答正确。${question.explanation}`;
    } else {
      const mistake = question.commonMistakes.find((item) => normalize(item.pattern) === normalizedAnswer);
      if (mistake) mistakeTypes.push(mistake.pattern);
      feedback = mistake?.message ?? `还差一步。${generateHint(question, attempts - 1)}`;
    }
  } else {
    mentionedPoints = question.requiredPoints.filter((point) => pointHit(answer, point, question.keywords));
    missingPoints = question.requiredPoints.filter((point) => !mentionedPoints.includes(point));
    const keywordHits = question.keywords.filter((keyword) => normalize(answer).includes(normalize(keyword)));
    keywordCoverage = Math.max(
      question.requiredPoints.length ? mentionedPoints.length / question.requiredPoints.length : 0,
      question.keywords.length ? keywordHits.length / question.keywords.length : 0
    );
    isCorrect = keywordCoverage >= 0.72 && mentionedPoints.length >= Math.ceil(question.requiredPoints.length * 0.65);
    if (keywordCoverage >= 0.78) feedback = "回答较完整，已经抓住主要物理逻辑。";
    else if (keywordCoverage >= 0.45) feedback = "基本正确但还不完整，可以补上关键过程或条件。";
    else feedback = "需要继续思考。先把光路、变化量和实验条件说清楚。";

    const matchingMistake = question.commonMistakes.find((mistake) => normalize(answer).includes(normalize(mistake.pattern)));
    if (matchingMistake) {
      mistakeTypes.push(matchingMistake.pattern);
      feedback += ` ${matchingMistake.message}`;
    }
  }

  return {
    questionId: question.id,
    answer,
    firstAnswer: previous?.firstAnswer || answer,
    isCorrect,
    attempts,
    viewedReference: previous?.viewedReference ?? false,
    keywordCoverage,
    missingPoints,
    mentionedPoints,
    mistakeTypes,
    feedback,
    updatedAt: new Date().toISOString()
  };
}

export function generateLearningDiagnostics(state: StudyState): ModuleDiagnostic[] {
  return modules.map((module) => {
    const related = questionBank.filter((q) => q.module.includes(module));
    const records = related.map((q) => state.records[q.id]).filter(Boolean);
    const attempted = records.length;
    const correct = records.filter((r) => r.isCorrect).length;
    const firstCorrect = records.filter((r, index) => {
      const q = related.filter((item) => state.records[item.id])[index];
      return r.firstAnswer && normalize(r.firstAnswer) === normalize(q.correctAnswer ?? r.answer) && r.isCorrect;
    }).length;
    const viewedReference = records.filter((r) => r.viewedReference).length;
    const retryPenalty = records.reduce((sum, r) => sum + Math.max(0, r.attempts - 1), 0);
    const objectiveScore = attempted ? correct / attempted : 0;
    const keywordScore = records.length
      ? records.reduce((sum, r) => sum + (r.keywordCoverage || (r.isCorrect ? 1 : 0)), 0) / records.length
      : 0;
    const score = attempted
      ? Math.max(0, Math.round((objectiveScore * 0.55 + keywordScore * 0.35 + (firstCorrect / attempted) * 0.1) * 100 - retryPenalty * 4 - viewedReference * 3))
      : 0;
    const mastery =
      score >= 85 ? "已掌握" : score >= 70 ? "基本掌握" : score >= 50 ? "需要巩固" : "重点复习";
    const weakReasons = [
      attempted < related.length ? "相关题目尚未全部完成" : "",
      objectiveScore < 0.7 ? "正确率偏低" : "",
      firstCorrect / Math.max(1, attempted) < 0.55 ? "首次作答稳定性不足" : "",
      retryPenalty > 1 ? "存在多次重答" : "",
      viewedReference > 0 ? "部分题目查看过参考答案" : ""
    ].filter(Boolean);
    return { module, attempted, correct, firstCorrect, viewedReference, retryPenalty, mastery, score, weakReasons };
  });
}

export function generateLearningRecommendation(state: StudyState): LearningRecommendation[] {
  const diagnostics = generateLearningDiagnostics(state);
  return diagnostics
    .filter((item) => item.mastery === "需要巩固" || item.mastery === "重点复习")
    .map((item) => {
      const relatedQuestions = questionBank.filter((q) => q.module.includes(item.module));
      const relatedPractice = personalizedPracticeQuestions.filter((q) => q.module.includes(item.module));
      const weakIds = relatedQuestions
        .filter((q) => !state.records[q.id]?.isCorrect || state.records[q.id]?.viewedReference)
        .map((q) => q.id)
        .slice(0, 4);
      const practicedOrWrongIds = new Set([
        ...Object.keys(state.records),
        ...weakIds
      ]);
      const newQuestionIds = [...relatedQuestions, ...relatedPractice]
        .filter((q) => !practicedOrWrongIds.has(q.id))
        .map((q) => q.id)
        .slice(0, 4);
      const first = relatedQuestions[0];
      return {
        module: item.module,
        reason: item.weakReasons.join("；") || "该模块作答证据不足",
        review: first?.recommendation ?? "回到相关题目，先复述物理过程，再写公式。",
        questionIds: newQuestionIds.length ? newQuestionIds : relatedPractice.slice(0, 3).map((q) => q.id),
        weakQuestionIds: weakIds
      };
    });
}

export function generateLearningReport(state: StudyState) {
  const records = Object.values(state.records);
  const totalAttempted = records.length;
  const correct = records.filter((r) => r.isCorrect).length;
  const firstCorrect = records.filter((r) => {
    const q = questionBank.find((item) => item.id === r.questionId);
    if (!q) return false;
    if (q.type === "short") return r.keywordCoverage >= 0.72 && r.attempts === 1;
    return normalize(r.firstAnswer) === normalize(q.correctAnswer ?? "");
  }).length;
  const weakQuestions = questionBank.filter((q) => state.records[q.id] && !state.records[q.id].isCorrect);
  return {
    totalAttempted,
    correct,
    accuracy: totalAttempted ? Math.round((correct / totalAttempted) * 100) : 0,
    firstAccuracy: totalAttempted ? Math.round((firstCorrect / totalAttempted) * 100) : 0,
    diagnostics: generateLearningDiagnostics(state),
    recommendations: generateLearningRecommendation(state),
    weakQuestions,
    completed: totalAttempted === questionBank.length
  };
}
