export type QuestionType = "choice" | "judgement" | "short";
export type MasteryLevel = "已掌握" | "基本掌握" | "需要巩固" | "重点复习";
export type ViewName = "home" | "guide" | "quiz" | "precheck" | "classroomQa" | "dataLab" | "extension" | "report" | "teacher";

export interface Option {
  key: string;
  text: string;
}

export interface CommonMistake {
  pattern: string;
  message: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  module: string[];
  difficulty: "基础" | "中等" | "挑战";
  question: string;
  options?: Option[];
  correctAnswer?: string;
  referenceAnswer?: string;
  explanation: string;
  keywords: string[];
  requiredPoints: string[];
  commonMistakes: CommonMistake[];
  hints: string[];
  followUpQuestions: string[];
  recommendation: string;
  score: number;
}

export interface AnswerRecord {
  questionId: string;
  answer: string;
  firstAnswer: string;
  isCorrect: boolean;
  attempts: number;
  viewedReference: boolean;
  keywordCoverage: number;
  missingPoints: string[];
  mentionedPoints: string[];
  mistakeTypes: string[];
  feedback: string;
  updatedAt: string;
}

export interface StudyState {
  studentName: string;
  currentIndex: number;
  records: Record<string, AnswerRecord>;
  wrongBook: string[];
  completedAt?: string;
  practiceMode: "all" | "wrong";
}

export interface ModuleDiagnostic {
  module: string;
  attempted: number;
  correct: number;
  firstCorrect: number;
  viewedReference: number;
  retryPenalty: number;
  mastery: MasteryLevel;
  score: number;
  weakReasons: string[];
}

export interface LearningRecommendation {
  module: string;
  reason: string;
  review: string;
  questionIds: string[];
  weakQuestionIds: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
}

export interface RagSource {
  id: string;
  source: string;
  page: number;
  title: string;
  snippet: string;
  score: number;
  library?: "base" | "extension";
  sourceUrl?: string;
}

export interface MeasurementPoint {
  id: string;
  n: number;
  d: number | null;
}

export interface WavelengthFitResult {
  slope: number;
  intercept: number;
  r2: number;
  wavelengthNm: number;
  relativeErrorPercent: number;
  residuals: Array<{ id: string; n: number; d: number; predicted: number; residual: number; standardized: number }>;
  residualSumSquares: number;
  sd: number;
  sm: number;
  tValue: number;
  uma: number;
  umb: number;
  um: number;
  uLambdaNm: number;
  typeAUncertaintyNm: number;
  typeBUncertaintyNm: number;
  combinedUncertaintyNm: number;
  outlierIds: string[];
  intervalWarnings: string[];
  finalExpression: string;
}

export type ExtensionExerciseType = "choice" | "judgement" | "short" | "design";

export interface ExtensionExercise {
  id: string;
  type: ExtensionExerciseType;
  question: string;
  options?: Option[];
  correctAnswer?: string;
  referenceAnswer: string;
}

export interface ExtensionResource {
  id: string;
  type: "video" | "text";
  title: string;
  description: string;
  url: string;
}

export interface ExtensionDirection {
  id: string;
  title: string;
  description: string;
  principle: string;
  learningGoals: string[];
  keywords: string[];
  questions: ExtensionExercise[];
  resources?: ExtensionResource[];
  defaultSummary: string;
}

export interface ExtensionLearningState {
  selectedDirectionId?: string;
  exerciseAnswers: Record<string, string>;
  completedQuestionIds: string[];
  messages: ChatMessage[];
  summary: string;
  reportAdded: boolean;
  viewedResourceTitles: Record<string, string>;
}
