import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileSearch,
  Home,
  Lightbulb,
  MessageCircle,
  Monitor,
  Printer,
  RefreshCcw,
  RotateCcw,
  Send,
  Sparkles,
  Smartphone,
  Table2,
  Target,
  Telescope,
  Upload,
  UserRound,
  XCircle
} from "lucide-react";
import { modules, questionBank, questionStats } from "./data/questionBank";
import { extensionDirections } from "./data/extensionExperiments";
import { personalizedPracticeQuestions } from "./data/personalizedPractice";
import {
  diagnoseAnswer,
  generateFollowUp,
  generateLearningDiagnostics,
  generateLearningReport,
  generateLearningRecommendation
} from "./services/agent";
import { generateAnswerWithModel, generateReinforcementQuestionsWithModel, searchDirectionMaterials } from "./services/rag";
import { clearStudyState, initialStudyState, loadStudyState, makeDemoState, saveStudyState } from "./services/storage";
import { fitWavelength, parseCsvTable } from "./services/wavelength";
import type { AnswerRecord, ChatMessage, ExtensionDirection, ExtensionLearningState, MeasurementPoint, Question, RagSource, StudyState, ViewName } from "./types";

const typeLabel = { choice: "选择题", judgement: "判断题", short: "简答题" };
const precheckIds = ["C02", "C03", "C04", "C05", "C01", "J01", "C07", "C08", "C09", "C06", "C10", "C11", "C15", "C12", "J10"];
const precheckQuestions = questionBank.filter((question) => precheckIds.includes(question.id));
const precheckStats = {
  total: precheckQuestions.length,
  choice: precheckQuestions.filter((question) => question.type === "choice").length,
  judgement: precheckQuestions.filter((question) => question.type === "judgement").length,
  short: precheckQuestions.filter((question) => question.type === "short").length
};
const choiceKeys = ["A", "B", "C", "D"];
const defaultMeasurementRows: MeasurementPoint[] = Array.from({ length: 10 }, (_, index) => ({
  id: `P${index + 1}`,
  n: index * 50,
  d: null
}));
const extensionStorageKey = "michelson-extension-learning-v1";
const displayModeStorageKey = "michelson-display-mode-session-v1";
const initialExtensionState: ExtensionLearningState = {
  exerciseAnswers: {},
  completedQuestionIds: [],
  messages: [],
  summary: "",
  reportAdded: false,
  viewedResourceTitles: {}
};

function hasCompleteChoiceOptions(question: Question) {
  if (question.type !== "choice") return true;
  const options = question.options ?? [];
  const optionKeys = new Set(options.map((option) => option.key));
  return (
    options.length >= 4 &&
    choiceKeys.every((key) => optionKeys.has(key)) &&
    options.every((option) => option.text.trim().length > 0) &&
    !!question.correctAnswer &&
    optionKeys.has(question.correctAnswer)
  );
}

function isPracticeQuestionUsable(question: Question) {
  if (!question.question.trim()) return false;
  if (question.type === "choice") return hasCompleteChoiceOptions(question);
  if (question.type === "judgement") return question.correctAnswer === "true" || question.correctAnswer === "false";
  return !!question.referenceAnswer || question.requiredPoints.length > 0;
}

function mergeUniqueQuestions(primary: Question[], fallback: Question[], limit = 4) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((question) => {
    if (seen.has(question.id) || !isPracticeQuestionUsable(question)) return false;
    seen.add(question.id);
    return true;
  }).slice(0, limit);
}

function loadExtensionState(): ExtensionLearningState {
  try {
    const raw = localStorage.getItem(extensionStorageKey);
    return raw ? { ...initialExtensionState, ...JSON.parse(raw) } : initialExtensionState;
  } catch {
    return initialExtensionState;
  }
}

type DisplayMode = "desktop" | "mobile";

function loadDisplayMode(): DisplayMode | null {
  try {
    const saved = sessionStorage.getItem(displayModeStorageKey);
    return saved === "desktop" || saved === "mobile" ? saved : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [displayMode, setDisplayMode] = useState<DisplayMode | null>(() => loadDisplayMode());
  const [view, setView] = useState<ViewName>("home");
  const [state, setState] = useState<StudyState>(() => loadStudyState());
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [quizScope, setQuizScope] = useState<"precheck" | "all" | "wrong" | "personalized">("precheck");
  const [personalizedPracticeSet, setPersonalizedPracticeSet] = useState<Question[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "你好，我是迈小测课中智能助教。你可以围绕实验原理、仪器调节、条纹现象和数据处理提问；我会优先参考课程资料库，给出简洁、可操作的回答。",
      sources: []
    }
  ]);
  const [dataPoints, setDataPoints] = useState<MeasurementPoint[]>(defaultMeasurementRows);
  const [instrumentBmm, setInstrumentBmm] = useState(0.0005);
  const [extensionState, setExtensionState] = useState<ExtensionLearningState>(() => loadExtensionState());
  const [extensionQuestionInput, setExtensionQuestionInput] = useState("");

  const activeQuestions = useMemo(() => {
    if (quizScope === "personalized") {
      return personalizedPracticeSet.length ? personalizedPracticeSet : personalizedPracticeQuestions;
    }
    if (quizScope === "wrong" || state.practiceMode === "wrong") {
      const wrong = questionBank.filter((q) => state.wrongBook.includes(q.id));
      return wrong.length ? wrong : questionBank;
    }
    if (quizScope === "precheck") return precheckQuestions;
    return questionBank;
  }, [personalizedPracticeSet, quizScope, state.practiceMode, state.wrongBook]);

  const currentQuestion = activeQuestions[Math.min(state.currentIndex, activeQuestions.length - 1)] ?? questionBank[0];
  const currentRecord = state.records[currentQuestion.id];
  const report = useMemo(() => generateLearningReport(state), [state]);
  const diagnostics = useMemo(() => generateLearningDiagnostics(state), [state]);
  const recommendations = useMemo(() => generateLearningRecommendation(state), [state]);
  const fitResult = useMemo(() => fitWavelength(dataPoints, instrumentBmm), [dataPoints, instrumentBmm]);
  const selectedExtension = useMemo(
    () => extensionDirections.find((direction) => direction.id === extensionState.selectedDirectionId),
    [extensionState.selectedDirectionId]
  );
  const progress = Math.round((Object.keys(state.records).length / questionBank.length) * 100);

  const chooseDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    try {
      sessionStorage.setItem(displayModeStorageKey, mode);
    } catch {
      // Session storage can be unavailable in restricted browsers; the in-memory choice still works.
    }
    if (mode === "mobile") setAssistantOpen(false);
  };

  useEffect(() => saveStudyState(state), [state]);
  useEffect(() => localStorage.setItem(extensionStorageKey, JSON.stringify(extensionState)), [extensionState]);
  useEffect(() => {
    if (displayMode === "mobile") setAssistantOpen(false);
  }, [displayMode]);
  useEffect(() => {
    setDraft(state.records[currentQuestion.id]?.answer ?? "");
  }, [currentQuestion.id, state.records]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patchState = (updater: (previous: StudyState) => StudyState) => setState((previous) => updater(previous));

  const submitAnswer = () => {
    if (currentQuestion.type === "choice" && !hasCompleteChoiceOptions(currentQuestion)) {
      setToast("本题选项不完整，已停止提交。请重新进入个性化练习获取稳定题目。");
      return;
    }
    if (!draft.trim()) {
      setToast("请先作答，再提交给迈小测诊断。");
      return;
    }
    if (currentQuestion.type === "short" && currentRecord?.attempts && currentRecord.attempts >= 2 && !currentRecord.viewedReference) {
      setToast("简答题已修改一次，可以先查看追问或参考答案。");
      return;
    }
    const record = diagnoseAnswer(currentQuestion, draft, currentRecord);
    patchState((previous) => ({
      ...previous,
      records: { ...previous.records, [currentQuestion.id]: record },
      wrongBook: record.isCorrect
        ? previous.wrongBook.filter((id) => id !== currentQuestion.id)
        : Array.from(new Set([...previous.wrongBook, currentQuestion.id]))
    }));
    setToast(record.isCorrect ? "回答正确，已更新学习进度。" : "迈小测已生成提示和追问。");
  };

  const goNext = () => {
    if (!state.records[currentQuestion.id]) {
      setToast("提交本题后才能进入下一题。");
      return;
    }
    if (state.currentIndex >= activeQuestions.length - 1) {
      patchState((previous) => ({ ...previous, completedAt: new Date().toISOString() }));
      setView("report");
      return;
    }
    patchState((previous) => ({ ...previous, currentIndex: previous.currentIndex + 1 }));
  };

  const goPrevious = () => patchState((previous) => ({ ...previous, currentIndex: Math.max(0, previous.currentIndex - 1) }));

  const markReferenceViewed = () => {
    const existing = state.records[currentQuestion.id] ?? diagnoseAnswer(currentQuestion, draft || "查看参考答案");
    patchState((previous) => ({
      ...previous,
      records: {
        ...previous.records,
        [currentQuestion.id]: { ...existing, viewedReference: true, updatedAt: new Date().toISOString() }
      }
    }));
  };

  const restart = () => {
    if (!window.confirm("确认重新开始？本地学习记录会被清空。")) return;
    clearStudyState();
    setState(initialStudyState);
    setDraft("");
    setView("home");
    setToast("已重新开始。");
  };

  const startWrongPractice = () => {
    if (!state.wrongBook.length) {
      setToast("当前还没有错题。");
      return;
    }
    setQuizScope("wrong");
    patchState((previous) => ({ ...previous, currentIndex: 0, practiceMode: "wrong" }));
    setView("quiz");
  };

  const practiceModule = async (module: string) => {
    const recommendation = recommendations.find((item) => item.module === module);
    const source = [...personalizedPracticeQuestions, ...questionBank].filter(isPracticeQuestionUsable);
    const excludedIds = new Set(recommendation?.weakQuestionIds ?? []);
    const recommendedQuestions = (recommendation?.questionIds ?? [])
      .map((id) => source.find((q) => q.id === id))
      .filter((question): question is Question => !!question && !excludedIds.has(question.id) && isPracticeQuestionUsable(question));
    const fallbackQuestions = source
      .filter((q) => q.module.includes(module) && !excludedIds.has(q.id));
    let nextPracticeSet = mergeUniqueQuestions(recommendedQuestions, fallbackQuestions, 4);
    if (nextPracticeSet.length < 3) {
      setToast("正在为该薄弱知识点生成补充巩固题。");
      const generated = (await generateReinforcementQuestionsWithModel(module, recommendation?.weakQuestionIds ?? [], 3 - nextPracticeSet.length))
        .filter(isPracticeQuestionUsable);
      nextPracticeSet = mergeUniqueQuestions(nextPracticeSet, generated, 4);
    }
    if (!nextPracticeSet.length) return;
    setPersonalizedPracticeSet(nextPracticeSet);
    setQuizScope("personalized");
    patchState((previous) => ({ ...previous, practiceMode: "all", currentIndex: 0 }));
    setView("quiz");
  };

  const startPrecheck = () => {
    setQuizScope("precheck");
    patchState((previous) => ({ ...previous, practiceMode: "all", currentIndex: 0 }));
    setView("quiz");
  };

  const sendChat = async () => {
    if (!chatInput.trim()) {
      setToast("请先输入一个问题。");
      return;
    }
    const question = chatInput.trim();
    setChatInput("");
    setChatMessages((previous) => [...previous, { role: "user", content: question }]);
    const result = await generateAnswerWithModel(question);
    setChatMessages((previous) => [...previous, { role: "assistant", content: result.answer, sources: result.sources }]);
  };

  const patchExtensionState = (updater: (previous: ExtensionLearningState) => ExtensionLearningState) => setExtensionState((previous) => updater(previous));

  const selectExtensionDirection = (directionId: string) => {
    const direction = extensionDirections.find((item) => item.id === directionId);
    patchExtensionState((previous) => ({
      ...previous,
      selectedDirectionId: directionId,
      messages: previous.selectedDirectionId === directionId ? previous.messages : [],
      summary: previous.selectedDirectionId === directionId ? previous.summary : direction?.defaultSummary ?? "",
      reportAdded: false
    }));
  };

  const markExtensionResourceViewed = (resourceId: string, title: string) => {
    patchExtensionState((previous) => ({
      ...previous,
      viewedResourceTitles: {
        ...(previous.viewedResourceTitles ?? {}),
        [resourceId]: title
      },
      reportAdded: false
    }));
  };

  const submitExtensionExercise = (exerciseId: string, answer: string) => {
    if (!answer.trim()) {
      setToast("请先完成本题作答。");
      return;
    }
    patchExtensionState((previous) => ({
      ...previous,
      exerciseAnswers: { ...previous.exerciseAnswers, [exerciseId]: answer },
      completedQuestionIds: Array.from(new Set([...previous.completedQuestionIds, exerciseId])),
      reportAdded: false
    }));
    setToast("拓展思考题已记录。");
  };

  const sendExtensionQuestion = async () => {
    if (!selectedExtension || !extensionQuestionInput.trim()) {
      setToast("请先选择拓展方向并输入问题。");
      return;
    }
    const question = extensionQuestionInput.trim();
    setExtensionQuestionInput("");
    patchExtensionState((previous) => ({
      ...previous,
      messages: [...previous.messages, { role: "user", content: question }]
    }));
    const result = await generateAnswerWithModel(question, {
      mode: "extension",
      directionTitle: selectedExtension.title,
      keywords: selectedExtension.keywords
    });
    patchExtensionState((previous) => ({
      ...previous,
      messages: [...previous.messages, { role: "assistant", content: result.answer, sources: result.sources }],
      reportAdded: false
    }));
  };

  const addExtensionToReport = () => {
    if (!selectedExtension) {
      setToast("请先选择一个拓展方向。");
      return;
    }
    patchExtensionState((previous) => ({ ...previous, reportAdded: true }));
    setToast("拓展实验记录已加入报告。");
  };

  if (!displayMode) {
    return <DisplayModeChooser onChoose={chooseDisplayMode} />;
  }

  return (
    <div className={`app-shell min-h-screen overflow-x-hidden bg-space text-slate-100 ${displayMode === "mobile" ? "mobile-mode" : "desktop-mode"}`}>
      <OpticBackground />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-space/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button className="flex items-center gap-2 text-left" onClick={() => setView("home")}>
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-cyanbeam/40 bg-cyanbeam/10 text-cyanbeam">
              <Telescope size={21} />
            </span>
            <span>
              <span className="block text-sm text-cyanbeam">迈小测</span>
              <span className="block font-semibold">智能预习平台</span>
            </span>
          </button>
          <nav className="desktop-nav flex items-center gap-2">
            <NavButton active={view === "guide"} onClick={() => setView("guide")} icon={<BookOpenCheck size={18} />} label="引导" />
            <NavButton active={view === "precheck" || view === "quiz"} onClick={() => setView("precheck")} icon={<ClipboardList size={18} />} label="预习检测" />
            <NavButton active={view === "classroomQa"} onClick={() => setView("classroomQa")} icon={<MessageCircle size={18} />} label="智能问答" />
            <NavButton active={view === "dataLab"} onClick={() => setView("dataLab")} icon={<Calculator size={18} />} label="数据处理" />
            <NavButton active={view === "extension"} onClick={() => setView("extension")} icon={<Sparkles size={18} />} label="拓展实验" />
            <NavButton active={view === "report"} onClick={() => setView("report")} icon={<BarChart3 size={18} />} label="报告" />
            <NavButton active={view === "teacher"} onClick={() => setView("teacher")} icon={<BrainCircuit size={18} />} label="教师" />
          </nav>
          <button
            className="mode-switch btn-secondary"
            onClick={() => {
              try {
                sessionStorage.removeItem(displayModeStorageKey);
              } catch {
                // Ignore storage failures; switching still works in memory.
              }
              setDisplayMode(null);
            }}
          >
            {displayMode === "mobile" ? <Smartphone size={17} /> : <Monitor size={17} />}
            <span>{displayMode === "mobile" ? "手机版" : "电脑版"}</span>
          </button>
        </div>
      </header>

      <main className="app-main relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {view === "home" && (
          <HomePage
            state={state}
            progress={progress}
            setView={setView}
            setName={(studentName) => patchState((previous) => ({ ...previous, studentName }))}
            continueStudy={() => {
              setQuizScope("precheck");
              setView("quiz");
            }}
            restart={restart}
          />
        )}
        {view === "guide" && <GuidePage onStart={() => setView("quiz")} />}
        {view === "precheck" && (
          <PrecheckPage
            state={state}
            progress={progress}
            diagnostics={diagnostics}
            recommendations={recommendations}
            onStart={startPrecheck}
            onReport={() => setView("report")}
            onPracticeModule={practiceModule}
            onWrongPractice={startWrongPractice}
          />
        )}
        {view === "quiz" && (
          <QuizPage
            question={currentQuestion}
            record={currentRecord}
            draft={draft}
            setDraft={setDraft}
            index={state.currentIndex}
            total={activeQuestions.length}
            submitAnswer={submitAnswer}
            goNext={goNext}
            goPrevious={goPrevious}
            markReferenceViewed={markReferenceViewed}
            startWrongPractice={startWrongPractice}
            allMode={() => {
              setQuizScope("all");
              patchState((previous) => ({ ...previous, currentIndex: 0, practiceMode: "all" }));
            }}
            practiceMode={quizScope === "wrong" ? "wrong" : "all"}
          />
        )}
        {view === "report" && (
          <ReportPage
            state={state}
            report={report}
            onWrongPractice={startWrongPractice}
            onPracticeModule={practiceModule}
            onHome={() => setView("home")}
            extensionState={extensionState}
            selectedExtension={selectedExtension}
          />
        )}
        {view === "teacher" && (
          <TeacherPage
            state={state}
            loadDemo={() => {
              setState(makeDemoState());
              setToast("已生成演示用模拟数据。");
            }}
            clearData={restart}
          />
        )}
        {view === "classroomQa" && (
          <ClassroomQaPage
            messages={chatMessages}
            input={chatInput}
            setInput={setChatInput}
            onSend={sendChat}
          />
        )}
        {view === "dataLab" && (
          <DataLabPage
            points={dataPoints}
            setPoints={setDataPoints}
            result={fitResult}
            instrumentBmm={instrumentBmm}
            setInstrumentBmm={setInstrumentBmm}
            setToast={setToast}
            onGoExtension={() => setView("extension")}
          />
        )}
        {view === "extension" && (
          <ExtensionExperimentPanel
            extensionState={extensionState}
            selectedExtension={selectedExtension}
            selectExtensionDirection={selectExtensionDirection}
            submitExtensionExercise={submitExtensionExercise}
            patchExtensionState={patchExtensionState}
            questionInput={extensionQuestionInput}
            setQuestionInput={setExtensionQuestionInput}
            sendQuestion={sendExtensionQuestion}
            addToReport={addExtensionToReport}
            markResourceViewed={markExtensionResourceViewed}
          />
        )}
      </main>

      <AssistantCard
        open={assistantOpen}
        setOpen={setAssistantOpen}
        progress={progress}
        diagnostics={diagnostics}
        recommendations={recommendations}
      />
      {displayMode === "mobile" && <MobileTabBar view={view} setView={setView} />}
      {toast && <div className="toast-message fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-cyanbeam/30 bg-panel px-4 py-3 text-sm shadow-glow">{toast}</div>}
    </div>
  );
}

function DisplayModeChooser({ onChoose }: { onChoose: (mode: DisplayMode) => void }) {
  return (
    <div className="min-h-screen overflow-hidden bg-space text-slate-100">
      <OpticBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8">
        <section className="w-full rounded-lg border border-white/10 bg-panel/80 p-6 shadow-glow sm:p-8">
          <div className="mb-7">
            <p className="text-sm text-cyanbeam">迈小测 · 进入前请选择界面</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">迈克耳孙干涉仪智能平台</h1>
            <p className="mt-4 max-w-2xl text-slate-300">
              同学们可以按照自己的设备选择手机版或电脑版。两种界面共享学习记录、题库、问答和报告。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <button className="choice-card text-left" onClick={() => onChoose("mobile")}>
              <span className="choice-icon"><Smartphone size={28} /></span>
              <span className="mt-4 block text-2xl font-semibold text-slate-100">手机版</span>
              <span className="mt-3 block text-sm leading-7 text-slate-300">适合微信、手机浏览器打开。文字自动换行，导航放到底部，答题和问答区域更适合单手浏览。</span>
              <span className="mt-5 inline-flex text-sm font-semibold text-cyanbeam">进入手机版</span>
            </button>
            <button className="choice-card text-left" onClick={() => onChoose("desktop")}>
              <span className="choice-icon"><Monitor size={28} /></span>
              <span className="mt-4 block text-2xl font-semibold text-slate-100">电脑版</span>
              <span className="mt-3 block text-sm leading-7 text-slate-300">保留现在的大屏展示效果，适合投屏、电脑浏览器、课堂演示和教师端查看。</span>
              <span className="mt-5 inline-flex text-sm font-semibold text-cyanbeam">进入电脑版</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function HomePage({
  state,
  progress,
  setView,
  setName,
  continueStudy,
  restart
}: {
  state: StudyState;
  progress: number;
  setView: (view: ViewName) => void;
  setName: (name: string) => void;
  continueStudy: () => void;
  restart: () => void;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.32fr_0.68fr]">
      <div className="home-hero relative min-h-[520px] overflow-hidden rounded-lg border border-white/10 bg-panel/70 p-6 shadow-glow sm:p-10">
        <div className="home-hero-ring absolute right-[-90px] top-8 h-80 w-80 rounded-full border border-cyanbeam/25" />
        <div className="home-hero-ring absolute right-[-40px] top-20 h-56 w-56 rounded-full border border-violetbeam/25" />
        <div className="relative">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyanbeam/30 px-3 py-1 text-sm text-cyanbeam">
            <Sparkles size={16} /> 全国大学生物理实验讲课竞赛展示版
          </p>
          <h1 className="home-title max-w-none whitespace-nowrap text-[clamp(2.25rem,4.1vw,3.75rem)] font-bold leading-tight">迈克耳孙干涉仪智能平台</h1>
          <p className="mt-5 max-w-2xl text-xl text-slate-300">从实验桌上的干涉圆环，走向丈量宇宙的精密标尺</p>
          <p className="mt-6 max-w-3xl text-slate-300">
            通过课前引导、即时反馈、知识诊断和个性化推荐，帮助学生把“光程差变化、干涉级次变化、条纹吞吐、反推波长”的主线真正连起来。
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="预计完成" value="25-35 分钟" />
            <Metric label="核心检测" value={`${precheckStats.total} 题`} />
            <Metric label="选择/判断" value={`${precheckStats.choice}/${precheckStats.judgement}`} />
            <Metric label="后续巩固" value="按错题推荐" />
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <label className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="field pl-10"
                value={state.studentName}
                onChange={(event) => setName(event.target.value)}
                placeholder="学生姓名或学号（可选）"
                aria-label="学生姓名或学号"
              />
            </label>
            <button className="btn-primary" onClick={() => setView("guide")}>开始15题核心检测</button>
            <button className="btn-secondary" onClick={continueStudy}>继续上次学习</button>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <ProgressBar value={progress} />
            <span className="min-w-16 text-right text-sm text-slate-300">{progress}%</span>
          </div>
          <button className="mt-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyanbeam" onClick={restart}>
            <RotateCcw size={16} /> 重新开始
          </button>
        </div>
      </div>
      <div className="space-y-4">
        <Panel title="预习目标" icon={<Target size={18} />}>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>建立迈克耳孙干涉仪“一分为二、合二为一”的光路模型。</li>
            <li>解释可动镜位移与两倍光程差变化的关系。</li>
            <li>用条纹吞吐计数推导激光波长测量公式。</li>
            <li>识别回程差、计数误差、拟合处理等实验关键点。</li>
          </ul>
        </Panel>
        <Panel title="知识模块概览" icon={<BrainCircuit size={18} />}>
          <div className="grid gap-2 sm:grid-cols-2">
            {modules.map((module, index) => (
              <div key={module} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                <span className="mr-2 text-cyanbeam">{index + 1}.</span>{module}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function GuidePage({ onStart }: { onStart: () => void }) {
  const cards = [
    ["核心问题", "如何把看不见的微小位移，转化为可观察、可计数的干涉条纹变化？"],
    ["光路思想", "G1 将光束“一分为二”，两臂分别传播并由 M1、M2 反射，最后回到 G1“合二为一”。"],
    ["两倍关系", "可动镜移动 Δx，去程和回程各改变 Δx，所以对应光程差变化约为 2Δx。"],
    ["条纹吞吐", "中心每完整吞入或吐出一条条纹，代表光程差改变一个波长 λ。"],
    ["安全提示", "激光不可直视，也不要让反射光扫过他人眼睛；调节时保持低姿态、慢动作。"],
    ["完成要求", "先完成 15 道核心检测题，查看诊断结果，再根据薄弱点进入个性化巩固练习。"]
  ];
  return (
    <section className="space-y-6">
      <SectionHeader title="预习引导" subtitle="迈小测先给你脚手架，不提前泄露整套答案。" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([title, body]) => (
          <div key={title} className="rounded-lg border border-white/10 bg-panel/70 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-cyanbeam"><Lightbulb size={18} />{title}</h3>
            <p className="text-sm leading-7 text-slate-300">{body}</p>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={onStart}>进入智能答题</button>
    </section>
  );
}

function PrecheckPage({
  state,
  progress,
  diagnostics,
  recommendations,
  onStart,
  onReport,
  onPracticeModule,
  onWrongPractice
}: {
  state: StudyState;
  progress: number;
  diagnostics: any[];
  recommendations: any[];
  onStart: () => void;
  onReport: () => void;
  onPracticeModule: (module: string) => void;
  onWrongPractice: () => void;
}) {
  const weak = diagnostics.filter((item) => item.attempted > 0 && item.score < 70);
  const completed = precheckQuestions.filter((question) => state.records[question.id]).length;
  const precheckWrong = precheckQuestions.filter((question) => state.records[question.id] && !state.records[question.id].isCorrect);
  const mistakeBuckets = [
    { label: "补偿板理解错误", modules: ["补偿板作用"] },
    { label: "光程差公式掌握不清", modules: ["激光波长测量原理"] },
    { label: "条纹变化规律不熟", modules: ["等倾干涉与条纹变化"] },
    { label: "数据处理方法薄弱", modules: ["误差与数据处理"] }
  ].map((bucket) => ({
    ...bucket,
    count: questionBank.filter((q) => bucket.modules.some((module) => q.module.includes(module)) && state.records[q.id] && !state.records[q.id].isCorrect).length
  }));

  return (
    <section className="space-y-6">
      <SectionHeader title="课前预习检测" subtitle="先用 15 道核心题完成基础学情判断，再根据错题薄弱点推送后续巩固练习。" />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="核心检测" value={`${completed}/${precheckQuestions.length}`} />
        <Metric label="检测进度" value={`${Math.round((completed / precheckQuestions.length) * 100)}%`} />
        <Metric label="检测错题" value={`${precheckWrong.length} 题`} />
        <Metric label="薄弱模块" value={`${weak.length} 个`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Panel title="错误知识点分布" icon={<BarChart3 size={18} />}>
          <div className="space-y-4">
            {mistakeBuckets.map((bucket) => (
              <div key={bucket.label}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{bucket.label}</span>
                  <span className="text-cyanbeam">{bucket.count} 题</span>
                </div>
                <ProgressBar value={Math.min(100, bucket.count * 25)} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="个性化推荐练习" icon={<Target size={18} />}>
          <div className="space-y-3">
            {recommendations.length ? recommendations.slice(0, 4).map((item) => (
              <button key={item.module} className="answer-option w-full" onClick={() => onPracticeModule(item.module)}>
                <span className="option-key"><RefreshCcw size={16} /></span>
                <span>
                  <span className="block font-semibold">薄弱知识点：{item.module}</span>
                  <span className="block text-sm text-slate-400">推荐新题：{item.questionIds.join("、")}</span>
                  <span className="block text-sm text-slate-400">推荐原因：{item.reason}</span>
                </span>
              </button>
            )) : (
              <p className="text-sm leading-7 text-slate-300">完成核心检测后，迈小测会根据错题自动推荐补偿板、光程差、条纹变化或数据处理等巩固练习。</p>
            )}
          </div>
        </Panel>
      </div>
      <Panel title="错题回顾" icon={<RefreshCcw size={18} />}>
        {precheckWrong.length ? (
          <div className="space-y-3">
            <p className="text-sm leading-7 text-slate-300">这里保留原错题和解析，用于回看错误原因；上方“个性化推荐练习”会推送同知识点的新题。</p>
            <div className="grid gap-3 md:grid-cols-2">
              {precheckWrong.map((question) => (
                <div key={question.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-slate-300">
                  <p className="font-semibold text-warm">{question.id} · {question.module.join("、")}</p>
                  <p className="mt-2">{question.question}</p>
                  <p className="mt-2 text-slate-400">解析：{question.explanation}</p>
                </div>
              ))}
            </div>
            <button className="btn-secondary" onClick={onWrongPractice}>进入错题本回顾</button>
          </div>
        ) : (
          <p className="text-sm leading-7 text-slate-300">当前核心检测还没有错题。提交检测后，这里会展示原错题；个性化练习区会展示新巩固题。</p>
        )}
      </Panel>
      <Panel title="核心知识覆盖" icon={<ClipboardList size={18} />}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "仪器结构与分光板",
            "补偿板与分振幅干涉",
            "相干条件与等倾圆环",
            "条纹吞吐与光程差",
            "波长公式与读数方法",
            "误差控制、拟合与应用拓展"
          ].map((item) => (
            <div key={item} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300">{item}</div>
          ))}
        </div>
      </Panel>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={onStart}>开始/继续检测</button>
        <button className="btn-secondary" onClick={onReport}>查看学习报告</button>
      </div>
    </section>
  );
}

function QuizPage(props: {
  question: Question;
  record?: AnswerRecord;
  draft: string;
  setDraft: (draft: string) => void;
  index: number;
  total: number;
  submitAnswer: () => void;
  goNext: () => void;
  goPrevious: () => void;
  markReferenceViewed: () => void;
  startWrongPractice: () => void;
  allMode: () => void;
  practiceMode: "all" | "wrong";
}) {
  const { question, record, draft, setDraft } = props;
  const canEditShort = question.type !== "short" || !record || record.attempts < 2 || record.viewedReference;
  const choiceOptions = hasCompleteChoiceOptions(question) ? question.options ?? [] : [];
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-white/10 bg-panel/80 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-cyanbeam">{typeLabel[question.type]} · {question.difficulty} · {question.id}</p>
            <h2 className="mt-2 text-2xl font-semibold">第 {props.index + 1} / {props.total} 题</h2>
          </div>
          <div className="flex gap-2">
            <button className={props.practiceMode === "wrong" ? "btn-primary" : "btn-secondary"} onClick={props.startWrongPractice}>错题本</button>
          </div>
        </div>
        <ProgressBar value={Math.round(((props.index + 1) / props.total) * 100)} />
        <p className="mt-6 text-xl leading-9 text-slate-50">{question.question}</p>
        <div className="mt-6">
          {question.type === "choice" && choiceOptions.length > 0 && (
            <div className="grid gap-3">
              {choiceOptions.map((option) => (
                <button
                  key={option.key}
                  className={`answer-option ${draft === option.key ? "answer-option-active" : ""}`}
                  onClick={() => setDraft(option.key)}
                >
                  <span className="option-key">{option.key}</span>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
          )}
          {question.type === "choice" && choiceOptions.length === 0 && (
            <div className="rounded-md border border-warm/30 bg-warm/10 p-4 text-sm leading-7 text-warm">
              本题选项格式不完整，系统已阻止空选项展示。请返回个性化练习重新进入该知识点，系统会优先推送本地稳定题库中的新题。
            </div>
          )}
          {question.type === "judgement" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button className={`answer-option ${draft === "true" ? "answer-option-active" : ""}`} onClick={() => setDraft("true")}>√ 正确</button>
              <button className={`answer-option ${draft === "false" ? "answer-option-active" : ""}`} onClick={() => setDraft("false")}>× 错误</button>
            </div>
          )}
          {question.type === "short" && (
            <textarea
              className="field min-h-44 resize-y leading-7"
              value={draft}
              disabled={!canEditShort}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="请用完整物理语言作答。迈小测会识别关键词、核心概念和必要逻辑。"
            />
          )}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={props.submitAnswer}>提交诊断</button>
          <button className="btn-secondary" onClick={props.goPrevious} disabled={props.index === 0}><ArrowLeft size={17} />上一题</button>
          <button className="btn-secondary" onClick={props.goNext}>下一题<ArrowRight size={17} /></button>
        </div>
        {record && <Feedback question={question} record={record} onViewReference={props.markReferenceViewed} />}
      </div>
      <aside className="space-y-4">
        <Panel title="本题知识标签" icon={<Target size={18} />}>
          <div className="flex flex-wrap gap-2">
            {question.module.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
          </div>
        </Panel>
        <Panel title="逐级提示" icon={<Lightbulb size={18} />}>
          <ul className="space-y-2 text-sm text-slate-300">
            {question.hints.map((hint) => <li key={hint}>· {hint}</li>)}
          </ul>
        </Panel>
        <Panel title="关键公式" icon={<Sparkles size={18} />}>
          <p className="formula">Δ = 2d cosθ</p>
          <p className="formula">2Δx = Nλ</p>
          <p className="formula">λ = 2Δx / N</p>
        </Panel>
      </aside>
    </section>
  );
}

function Feedback({ question, record, onViewReference }: { question: Question; record: AnswerRecord; onViewReference: () => void }) {
  const followUp = generateFollowUp(question, record.missingPoints);
  const correctText =
    question.type === "choice"
      ? `${question.correctAnswer}：${question.options?.find((option) => option.key === question.correctAnswer)?.text ?? ""}`
      : question.type === "judgement"
        ? question.correctAnswer === "true" ? "正确" : "错误"
        : "见参考答案";
  const myAnswer =
    question.type === "choice"
      ? `${record.answer}：${question.options?.find((option) => option.key === record.answer)?.text ?? record.answer}`
      : question.type === "judgement"
        ? record.answer === "true" ? "正确" : "错误"
        : record.answer;
  return (
    <div className={`mt-6 rounded-lg border p-5 ${record.isCorrect ? "border-emerald-400/30 bg-emerald-400/10" : "border-warm/30 bg-warm/10"}`}>
      <div className="flex items-start gap-3">
        {record.isCorrect ? <CheckCircle2 className="mt-1 text-emerald-300" /> : <XCircle className="mt-1 text-warm" />}
        <div>
          <h3 className="font-semibold">{record.isCorrect ? "迈小测：判断正确" : "迈小测：还可以再推进一步"}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-200">{record.feedback}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-2 text-sm font-semibold text-cyanbeam">正确答案</p>
          <p className="text-sm leading-6 text-slate-200">{correctText}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-2 text-sm font-semibold text-cyanbeam">我的答案</p>
          <p className="text-sm leading-6 text-slate-200">{myAnswer}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-2 text-sm font-semibold text-cyanbeam">关键解析</p>
          <p className="text-sm leading-6 text-slate-200">{question.explanation}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-2 text-sm font-semibold text-cyanbeam">对应知识点</p>
          <p className="text-sm leading-6 text-slate-200">{question.module.join("、")}</p>
          <p className={`mt-2 text-sm ${record.isCorrect ? "text-emerald-300" : "text-warm"}`}>{record.isCorrect ? "本题暂不需要进入巩固练习。" : "建议进入个性化巩固练习。"}</p>
        </div>
      </div>
      {question.type === "short" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <p className="mb-2 text-sm font-semibold text-cyanbeam">已提到的关键点</p>
            <p className="text-sm text-slate-300">{record.mentionedPoints.length ? record.mentionedPoints.join("；") : "暂未明显覆盖核心要点"}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <p className="mb-2 text-sm font-semibold text-warm">尚未涉及的关键点</p>
            <p className="text-sm text-slate-300">{record.missingPoints.length ? record.missingPoints.join("；") : "核心要点覆盖较好"}</p>
          </div>
        </div>
      )}
      {!record.isCorrect && (
        <div className="mt-4 rounded-md border border-cyanbeam/20 bg-cyanbeam/10 p-3 text-sm leading-7 text-slate-200">
          <span className="font-semibold text-cyanbeam">启发式追问：</span>{followUp}
        </div>
      )}
      <div className="mt-4">
        {!record.viewedReference ? (
          <button className="btn-secondary" onClick={onViewReference}>查看参考答案</button>
        ) : (
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-2 font-semibold text-cyanbeam">参考答案与解析</p>
            <p className="text-sm leading-7 text-slate-200">{question.referenceAnswer ?? question.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ClassroomQaPage({
  messages,
  input,
  setInput,
  onSend
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
}) {
  const sampleQuestions = [
    "补偿板的作用是什么？",
    "为什么 M1 移动 d，光程差变化是 2d？",
    "为什么会出现圆环条纹？",
    "条纹由密变疏说明什么？",
    "调不出干涉条纹怎么办？",
    "为什么测波长时要保持微动鼓轮单向转动？",
    "如何判断数据中是否存在异常点？"
  ];
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="rounded-lg border border-white/10 bg-panel/80 p-5 sm:p-6">
        <SectionHeader title="课中智能问答" subtitle="围绕迈克耳孙干涉仪实验原理、操作调节与数据处理进行即时答疑。" />
        <div className="mt-6 h-[560px] space-y-4 overflow-auto rounded-lg border border-white/10 bg-white/[0.03] p-4">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[92%] rounded-lg border p-4 ${message.role === "user" ? "border-cyanbeam/30 bg-cyanbeam/15" : "border-white/10 bg-space/70"}`}>
                <MarkdownMessage content={message.content} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <textarea
            className="field min-h-20 resize-y"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSend();
            }}
            placeholder="请输入你在原理理解、仪器调节或数据处理中的问题，例如：为什么补偿板能补偿光程差？"
          />
          <button className="btn-primary self-stretch" onClick={onSend}><Send size={17} />发送</button>
        </div>
      </div>
      <aside className="space-y-4">
        <Panel title="课程资料库" icon={<Database size={18} />}>
          <p className="text-sm leading-7 text-slate-300">本模块已接入迈克耳孙干涉仪课程资料、实验讲稿、预习题库及相关论文资料。学生可以围绕实验原理、仪器调节、条纹现象、数据处理和应用拓展进行提问。系统将优先参考课程资料库生成回答，帮助你完成课前预习、课中答疑和实验后复盘。</p>
        </Panel>
        <Panel title="常见提问" icon={<MessageCircle size={18} />}>
          <div className="space-y-2">
            {sampleQuestions.map((question) => (
              <button key={question} className="answer-option w-full text-sm" onClick={() => setInput(question)}>{question}</button>
            ))}
          </div>
        </Panel>
        <Panel title="智能助教可以帮助你" icon={<FileSearch size={18} />}>
          <div className="space-y-3 text-sm leading-6 text-slate-300">
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3"><span className="font-semibold text-cyanbeam">原理理解：</span>补偿板、光程差、等倾干涉、条纹吞吐。</div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3"><span className="font-semibold text-cyanbeam">操作指导：</span>调平、光斑重合、圆环调节、单向转动。</div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3"><span className="font-semibold text-cyanbeam">数据分析：</span>线性拟合、波长计算、误差分析、不确定度。</div>
          </div>
        </Panel>
      </aside>
    </section>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const normalized = content
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
  return (
    <div className="markdown-message text-sm leading-7 text-slate-100">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function DataLabPage({
  points,
  setPoints,
  result,
  instrumentBmm,
  setInstrumentBmm,
  setToast,
  onGoExtension
}: {
  points: MeasurementPoint[];
  setPoints: (points: MeasurementPoint[]) => void;
  result: ReturnType<typeof fitWavelength>;
  instrumentBmm: number;
  setInstrumentBmm: (value: number) => void;
  setToast: (value: string) => void;
  onGoExtension: () => void;
}) {
  const updatePoint = (id: string, value: string) => {
    setPoints(points.map((point) => (point.id === id ? { ...point, d: value.trim() === "" ? null : Number(value) } : point)));
  };
  const handleUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsvTable(String(reader.result ?? ""));
      if (parsed.length < 3) {
        setToast("未识别到足够数据，请使用 N,d 两列 CSV/TSV。");
        return;
      }
      setPoints(parsed.length >= 10 ? parsed.slice(0, 10) : [...parsed, ...defaultMeasurementRows.slice(parsed.length)]);
      setToast("已导入实验数据。");
    };
    reader.readAsText(file);
  };

  return (
    <section className="space-y-6">
      <SectionHeader title="波长测量数据处理" subtitle="按实验记录输入 10 组反射镜末位置 d，系统自动完成 d=mN+b 拟合、λ=2m 换算和不确定度分析。" />
      <Panel title="实验计算关系" icon={<Sparkles size={18} />}>
        <FormulaGuide />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-[440px_1fr]">
        <Panel title="原始数据表格" icon={<Table2 size={18} />}>
          <div className="mb-4 flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => setPoints(defaultMeasurementRows)}>恢复 10 组模板</button>
            <label className="btn-secondary cursor-pointer">
              <Upload size={17} />上传 CSV
              <input className="hidden" type="file" accept=".csv,.txt,.tsv" onChange={(event) => handleUpload(event.target.files?.[0])} />
            </label>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-slate-400">
                <tr><th className="py-2">组号</th><th>条纹数 N</th><th>末位置 d/mm</th><th>备注或异常提示</th></tr>
              </thead>
              <tbody>
                {points.map((point, index) => (
                  <tr key={point.id} className="border-t border-white/10">
                    <td className="py-2 text-slate-400">{index + 1}</td>
                    <td className="font-mono text-cyanbeam">{point.n}</td>
                    <td><input className="field h-10 py-1" type="number" step="0.0001" value={point.d ?? ""} placeholder="输入读数" onChange={(event) => updatePoint(point.id, event.target.value)} /></td>
                    <td className="text-xs text-slate-400">{result?.outlierIds.includes(point.id) ? "偏离拟合直线，建议复测" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            仪器读数误差 Δ仪/mm（用于 B 类不确定度，默认 0.0005 mm）
            <input className="field mt-2" type="number" step="0.0001" value={instrumentBmm} onChange={(event) => setInstrumentBmm(Number(event.target.value))} />
          </label>
        </Panel>
        <Panel title="拟合图像" icon={<BarChart3 size={18} />}>
          {result ? <FitChart result={result} /> : <p className="text-sm text-slate-300">至少输入 3 组有效数据后生成拟合图。</p>}
        </Panel>
      </div>
      {result && (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <Panel title="计算结果" icon={<Calculator size={18} />}>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="斜率 m/mm·条纹⁻¹" value={String(result.slope)} />
              <Metric label="截距 b/mm" value={String(result.intercept)} />
              <Metric label="R²" value={String(result.r2)} />
              <Metric label="λ/nm" value={`${result.wavelengthNm}`} />
              <Metric label="相对误差" value={`${result.relativeErrorPercent}%`} />
              <Metric label="最终结果" value={result.finalExpression} />
            </div>
          </Panel>
          <Panel title="误差与不确定度" icon={<AlertTriangle size={18} />}>
            <ul className="space-y-2 text-sm leading-6 text-slate-300">
              <li>理论参考值：λ₀ = 632.8 nm</li>
              <li>残差平方和 S：{result.residualSumSquares} mm²</li>
              <li>Sd：{result.sd} mm</li>
              <li>Sm：{result.sm} mm/条纹</li>
              <li>t₀.₉₅(v)：{result.tValue}（v = n - 2）</li>
              <li>UmA：{result.uma} mm/条纹</li>
              <li>UmB：{result.umb} mm/条纹</li>
              <li>Um：{result.um} mm/条纹</li>
              <li>Uλ：{result.uLambdaNm} nm</li>
            </ul>
          </Panel>
        </div>
      )}
      {result && (
        <Panel title="残差分析与改进建议" icon={<FileSearch size={18} />}>
          <div className="overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-slate-400"><tr><th>组号</th><th>N</th><th>d/mm</th><th>拟合 d/mm</th><th>残差/mm</th><th>标准化残差</th></tr></thead>
              <tbody>
                {result.residuals.map((point, index) => (
                  <tr key={point.id} className={`border-t border-white/10 ${result.outlierIds.includes(point.id) ? "bg-warm/10" : ""}`}>
                    <td className="py-2">{index + 1}</td><td>{point.n}</td><td>{point.d}</td><td>{point.predicted}</td><td>{point.residual}</td><td>{point.standardized}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            {result.outlierIds.length > 0 && <p className="text-warm">异常点提示：{result.outlierIds.join("、")} 偏离拟合直线较大，建议检查读数误差、条纹计数误差或操作振动。</p>}
            {result.intervalWarnings.map((warning) => <p key={warning} className="text-warm">{warning}</p>)}
            {result.r2 < 0.995 && <p className="text-warm">整体线性相关性不够理想，可能与条纹计数不准确、微动鼓轮反向转动或仪器调节不稳定有关。</p>}
            <p>改进建议：保持微动鼓轮单向转动，增加测量组数，避免半条纹计数，用同一视场中心完整吞吐作为计数标准，并对残差较大的点复测。</p>
          </div>
        </Panel>
      )}
      {result && (
        <Panel title="数据处理结果总结" icon={<CheckCircle2 size={18} />}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-3xl text-sm leading-7 text-slate-300">
              本次基础波长测量已完成，可结合拟合结果、相对误差、不确定度和残差分析判断数据质量。若需要继续展示实验改进与现代应用，可进入独立的拓展实验模块。
            </p>
            <button className="btn-primary" onClick={onGoExtension}>进入拓展实验<ArrowRight size={17} /></button>
          </div>
        </Panel>
      )}
    </section>
  );
}

function FormulaGuide() {
  const baseFormulas = [
    { label: "线性拟合", formula: "$$d=mN+b$$" },
    { label: "波长测量关系", formula: "$$2d=N\\lambda$$" },
    { label: "单位换算", formula: "$$\\lambda(\\mathrm{nm})=2m\\times10^6$$" },
    { label: "相对误差", formula: "$$E=\\frac{|\\lambda-\\lambda_0|}{\\lambda_0}\\times100\\%$$" }
  ];
  const uncertaintySteps = [
    { step: "第 1 步：残差平方和", formula: "$$S=\\sum [d_i-(b+mN_i)]^2$$" },
    { step: "第 2 步：因变量标准差", formula: "$$S_d=\\sqrt{\\frac{S}{n-2}}$$" },
    { step: "第 3 步：斜率标准差", formula: "$$S_m=\\frac{S_d}{\\sqrt{\\sum (N_i-\\bar{N})^2}}$$" },
    { step: "第 4 步：A 类不确定度", formula: "$$U_{mA}=t_{0.95}(v)S_m$$" },
    { step: "第 5 步：B 类不确定度", formula: "$$U_{mB}=\\frac{\\sqrt{3}}{2}\\cdot\\frac{\\Delta_{\\mathrm{仪}}}{|N_i-\\bar{N}|_{\\max}}$$" },
    { step: "第 6 步：合成不确定度", formula: "$$U_m=\\sqrt{U_{mA}^2+U_{mB}^2}$$" },
    { step: "第 7 步：波长不确定度", formula: "$$U_\\lambda(\\mathrm{nm})=2U_m\\times10^6$$" }
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {baseFormulas.map((item) => (
          <div key={item.label} className="formula-card">
            <p className="text-sm font-semibold text-cyanbeam">{item.label}</p>
            <MarkdownMessage content={item.formula} />
          </div>
        ))}
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-100">不确定度分析</p>
        <div className="grid gap-4">
          {uncertaintySteps.map((item) => (
            <div key={item.step} className="formula-card">
              <p className="text-sm font-semibold text-cyanbeam">{item.step}</p>
              <MarkdownMessage content={item.formula} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function materialTypeLabel(material: RagSource) {
  if (material.source?.includes("实验指导书")) return "实验指导";
  if (material.library === "extension") return "拓展论文";
  return "课程资料";
}

function materialReadableSummary(material: RagSource, direction: ExtensionDirection) {
  const title = `${material.title || ""}${material.source || ""}`;
  if (title.includes("白光和激光扩展光源协同调节白光等厚干涉条纹")) {
    return "该论文围绕白光等厚干涉条纹调节困难展开，提出用白光和激光扩展光源协同观察的方法。学习时可重点关注：白光条纹只在近等光程处出现，激光条纹可帮助判断动镜调节方向、调节速度以及回程差是否消除。";
  }
  if (title.includes("迈克尔逊干涉仪调节白光干涉条纹的实验研究")) {
    return "该资料讨论白光干涉条纹的调节与零光程差定位方法，强调借助参考条纹或辅助光学元件判断动镜位置，从而更准确地找到白光彩色条纹出现的区域。";
  }
  if (title.includes("基于白光迈克尔逊干涉系统的光栅拼接研究")) {
    return "该论文展示白光迈克耳孙干涉系统在精密光栅拼接中的应用，重点体现白光干涉在近零光程差定位、高精度对准和微小位移判断中的价值。";
  }
  if (title.includes("迈克尔逊干涉仪用步进电机驱动装置的设计")) {
    return "该论文围绕用步进电机驱动微动手轮展开，说明通过电机脉冲控制转角和转速，可以减少人工转动停顿、回程差和操作不稳定带来的误差。";
  }
  if (title.includes("迈克尔逊干涉仪干涉环纹光电计数器的研制")) {
    return "该论文设计光电计数器替代人工数环，把干涉条纹的明暗变化转化为可计数信号，用于降低漏数、多数和视觉疲劳造成的误差，提高波长测量的稳定性。";
  }
  if (direction.title.includes("白光")) {
    return "该资料与白光干涉方向相关，可用于理解白光相干长度短、彩色条纹只在近零光程差附近清晰出现，以及如何通过调节动镜捕捉中央条纹。";
  }
  if (direction.title.includes("仪器改进")) {
    return "该资料与实验仪器改进方向相关，可用于理解如何把人工调节、人工计数转化为自动驱动、光电探测或图像识别，提高实验稳定性和测量效率。";
  }
  return "该资料包含复杂公式或排版，建议点击查看原文。";
}

function isReadableMaterialSnippet(snippet: string) {
  const compact = snippet.replace(/\s+/g, "");
  const chineseCount = (compact.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinRun = /[A-Za-z]{18,}/.test(compact);
  const formulaNoise = /Fig|DOI|Vol|ISSN|CN\d|M1|M2|P1|[=＋+\-－×*/]{2,}/i.test(snippet);
  return chineseCount >= 55 && !latinRun && !formulaNoise;
}

function materialBrief(material: RagSource, direction: ExtensionDirection) {
  const snippet = String(material.snippet ?? "").trim();
  const generatedSummary = materialReadableSummary(material, direction);
  if (!snippet || snippet.length < 45 || !isReadableMaterialSnippet(snippet)) {
    return generatedSummary;
  }
  const directionHit = direction.keywords.find((keyword) => snippet.includes(keyword));
  const prefix = directionHit ? `该资料围绕“${directionHit}”展开，` : `该资料与“${direction.title}”方向相关，`;
  return `${prefix}${generatedSummary}`;
}

function MaterialCard({ material, direction, onViewed }: { material: RagSource; direction: ExtensionDirection; onViewed: () => void }) {
  const url = material.sourceUrl || "";
  return (
    <div className="resource-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="resource-pill">{materialTypeLabel(material)}</span>
          <h4 className="mt-3 break-words text-base font-semibold text-slate-50">{material.title || material.source}</h4>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        <p><span className="text-cyanbeam">关联方向：</span>{direction.title}</p>
        <p><span className="text-cyanbeam">简要说明：</span>{materialBrief(material, direction)}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {url ? (
          <a className="btn-secondary" href={url} target="_blank" rel="noreferrer" onClick={onViewed}>查看原文</a>
        ) : (
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">该资料暂不支持原文直达</span>
        )}
        <button className="btn-secondary" onClick={onViewed}>阅读摘要</button>
      </div>
    </div>
  );
}

function LearningResourceCard({ resource, onViewed }: { resource: NonNullable<ExtensionDirection["resources"]>[number]; onViewed: () => void }) {
  const isVideo = resource.type === "video";
  return (
    <div className="resource-card flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="resource-pill">{isVideo ? "视频" : "文本"}</span>
      </div>
      <h4 className="mt-3 break-words text-base font-semibold leading-7 text-slate-50">{resource.title}</h4>
      <p className="mt-2 resource-description text-sm leading-6 text-slate-400">{resource.description}</p>
      <div className="mt-auto pt-4">
        <a className="btn-primary inline-flex" href={resource.url} target="_blank" rel="noreferrer" onClick={onViewed}>
          {isVideo ? "观看视频" : "查看资料"}
        </a>
      </div>
    </div>
  );
}

function ExtensionExperimentPanel({
  extensionState,
  selectedExtension,
  selectExtensionDirection,
  submitExtensionExercise,
  patchExtensionState,
  questionInput,
  setQuestionInput,
  sendQuestion,
  addToReport,
  markResourceViewed
}: {
  extensionState: ExtensionLearningState;
  selectedExtension?: ExtensionDirection;
  selectExtensionDirection: (directionId: string) => void;
  submitExtensionExercise: (exerciseId: string, answer: string) => void;
  patchExtensionState: (updater: (previous: ExtensionLearningState) => ExtensionLearningState) => void;
  questionInput: string;
  setQuestionInput: (value: string) => void;
  sendQuestion: () => void;
  addToReport: () => void;
  markResourceViewed: (resourceId: string, title: string) => void;
}) {
  if (!selectedExtension) {
    return (
      <section className="space-y-6">
        <SectionHeader title="拓展实验与改进" subtitle="请选择一个方向，进一步探索迈克耳孙干涉仪在白光干涉和实验仪器改进中的应用。" />
        <div className="rounded-lg border border-cyanbeam/25 bg-cyanbeam/10 p-4 text-sm leading-7 text-slate-200">
          基础波长测量已完成。请选择一个拓展方向，进一步探索迈克耳孙干涉仪在现象观察和实验仪器改进中的应用。
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {extensionDirections.map((direction) => (
            <ExtensionDirectionCard key={direction.id} direction={direction} onSelect={() => selectExtensionDirection(direction.id)} />
          ))}
        </div>
      </section>
    );
  }

  const materials = searchDirectionMaterials(selectedExtension.title, selectedExtension.keywords, 5);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader title="拓展实验与改进" subtitle="围绕已选方向完成资料阅读、思考题和智能提问，并将学习记录写入实验报告。" />
        <button className="btn-secondary" onClick={() => patchExtensionState((previous) => ({ ...previous, selectedDirectionId: undefined, reportAdded: false }))}>返回重新选择方向</button>
      </div>
      <Panel title={selectedExtension.title} icon={<Sparkles size={18} />}>
        <p className="text-sm leading-7 text-slate-300">{selectedExtension.description}</p>
        <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-2 font-semibold text-cyanbeam">原理说明</p>
          <p className="text-sm leading-7 text-slate-300">{selectedExtension.principle}</p>
        </div>
      </Panel>
      <div className={`grid gap-6 ${materials.length ? "lg:grid-cols-[1fr_420px]" : ""}`}>
        {materials.length ? (
          <Panel title="相关资料推荐" icon={<FileSearch size={18} />}>
            <div className="grid gap-3 md:grid-cols-2">
              {materials.map((material) => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  direction={selectedExtension}
                  onViewed={() => markResourceViewed(`material-${material.id}`, material.title || material.source)}
                />
              ))}
            </div>
          </Panel>
        ) : null}
        <Panel title="学习重点" icon={<Target size={18} />}>
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            {selectedExtension.learningGoals.map((goal) => <li key={goal}>· {goal}</li>)}
          </ul>
        </Panel>
      </div>
      {selectedExtension.resources?.length ? (
        <Panel title="视频学习资料" icon={<BookOpenCheck size={18} />}>
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {selectedExtension.resources.map((resource) => (
              <LearningResourceCard
                key={resource.id}
                resource={resource}
                onViewed={() => markResourceViewed(resource.id, resource.title)}
              />
            ))}
          </div>
        </Panel>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Panel title="拓展思考题" icon={<ClipboardList size={18} />}>
          <div className="space-y-4">
            {selectedExtension.questions.map((exercise) => {
              const answer = extensionState.exerciseAnswers[exercise.id] ?? "";
              const completed = extensionState.completedQuestionIds.includes(exercise.id);
              return (
                <div key={exercise.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-semibold text-slate-100">{exercise.question}</p>
                  {exercise.options ? (
                    <div className="mt-3 grid gap-2">
                      {exercise.options.map((option) => (
                        <button
                          key={option.key}
                          className={`answer-option ${answer === option.key ? "answer-option-active" : ""}`}
                          onClick={() => patchExtensionState((previous) => ({ ...previous, exerciseAnswers: { ...previous.exerciseAnswers, [exercise.id]: option.key } }))}
                        >
                          <span className="option-key">{option.key}</span>{option.text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      className="field mt-3 min-h-24"
                      value={answer}
                      onChange={(event) => patchExtensionState((previous) => ({ ...previous, exerciseAnswers: { ...previous.exerciseAnswers, [exercise.id]: event.target.value } }))}
                      placeholder="写下你的思考或实验设计思路"
                    />
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button className="btn-secondary" onClick={() => submitExtensionExercise(exercise.id, extensionState.exerciseAnswers[exercise.id] ?? "")}>提交练习</button>
                    {completed && <span className="text-sm text-emerald-300">已完成 · 参考要点：{exercise.referenceAnswer}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="拓展方向智能助教" icon={<MessageCircle size={18} />}>
          <div className="max-h-80 space-y-3 overflow-auto rounded-md border border-white/10 bg-space/50 p-3">
            {extensionState.messages.length ? extensionState.messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-md border p-3 ${message.role === "user" ? "border-cyanbeam/30 bg-cyanbeam/10" : "border-white/10 bg-white/[0.04]"}`}>
                <MarkdownMessage content={message.content} />
              </div>
            )) : (
              <p className="text-sm leading-7 text-slate-300">可以围绕该拓展方向提问，例如实验如何设计、需要测哪些量、误差从哪里来。</p>
            )}
          </div>
          <textarea
            className="field mt-3 min-h-24"
            value={questionInput}
            onChange={(event) => setQuestionInput(event.target.value)}
            placeholder="请输入你对该拓展方向的疑问，例如：为什么白光干涉只能在零光程差附近观察到？"
          />
          <button className="btn-primary mt-3" onClick={sendQuestion}><Send size={17} />提问</button>
        </Panel>
      </div>
      <Panel title="写入实验报告" icon={<Download size={18} />}>
        <label className="block text-sm text-slate-300">
          个人总结
          <textarea
            className="field mt-2 min-h-28"
            value={extensionState.summary}
            onChange={(event) => patchExtensionState((previous) => ({ ...previous, summary: event.target.value, reportAdded: false }))}
            placeholder="通过本拓展方向，我认识到迈克耳孙干涉仪不仅可以用于激光波长测量，还可以通过改变光源、检测方式或驱动方式，实现更广泛的精密测量应用。"
          />
        </label>
        <button className="btn-primary mt-4" onClick={addToReport}>加入实验报告</button>
        {extensionState.reportAdded && <p className="mt-3 text-sm text-emerald-300">已加入实验报告，可前往“报告”模块查看。</p>}
      </Panel>
    </section>
  );
}

function ExtensionDirectionCard({ direction, onSelect }: { direction: ExtensionDirection; onSelect: () => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-panel/75 p-5">
      <h3 className="text-lg font-semibold text-cyanbeam">{direction.title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-300">{direction.description}</p>
      <div className="mt-4 space-y-2 text-sm text-slate-300">
        {direction.learningGoals.slice(0, 4).map((goal) => <p key={goal}>· {goal}</p>)}
      </div>
      <button className="btn-primary mt-5" onClick={onSelect}>选择该方向</button>
    </div>
  );
}

function FitChart({ result }: { result: NonNullable<ReturnType<typeof fitWavelength>> }) {
  const width = 920;
  const height = 430;
  const plotLeft = 86;
  const plotRight = width - 64;
  const plotTop = 78;
  const plotBottom = height - 78;
  const xs = result.residuals.map((point) => point.n);
  const ys = result.residuals.flatMap((point) => [point.d, point.predicted]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = Math.max(1, maxX - minX);
  const ySpan = Math.max(0.000001, maxY - minY);
  const xMinPlot = minX - xSpan * 0.04;
  const xMaxPlot = maxX + xSpan * 0.04;
  const yMinPlot = minY - ySpan * 0.1;
  const yMaxPlot = maxY + ySpan * 0.14;
  const sx = (x: number) => plotLeft + ((x - xMinPlot) / (xMaxPlot - xMinPlot)) * (plotRight - plotLeft);
  const sy = (y: number) => plotBottom - ((y - yMinPlot) / (yMaxPlot - yMinPlot)) * (plotBottom - plotTop);
  const lineStart = { x: xMinPlot, y: result.slope * xMinPlot + result.intercept };
  const lineEnd = { x: xMaxPlot, y: result.slope * xMaxPlot + result.intercept };
  const xTicks = Array.from({ length: 5 }, (_, index) => xMinPlot + ((xMaxPlot - xMinPlot) * index) / 4);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMinPlot + ((yMaxPlot - yMinPlot) * index) / 4);
  const formatTick = (value: number) => {
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
    return value.toFixed(3).replace(/\.?0+$/, "");
  };

  return (
    <div className="overflow-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[380px] w-full min-w-[760px]">
        <defs>
          <marker id="axis-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L9,4.5 L0,9 Z" fill="#111827" />
          </marker>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="8" fill="rgba(255,255,255,0.22)" />
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line x1={sx(tick)} y1={plotTop} x2={sx(tick)} y2={plotBottom} stroke="#d7e8f6" strokeWidth="1" />
            <line x1={sx(tick)} y1={plotBottom} x2={sx(tick)} y2={plotBottom + 7} stroke="#111827" strokeWidth="1.5" />
            <text x={sx(tick)} y={plotBottom + 28} textAnchor="middle" fill="#111827" fontSize="14" fontWeight="700">{formatTick(tick)}</text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={plotLeft} y1={sy(tick)} x2={plotRight} y2={sy(tick)} stroke="#d7e8f6" strokeWidth="1" />
            <line x1={plotLeft - 7} y1={sy(tick)} x2={plotLeft} y2={sy(tick)} stroke="#111827" strokeWidth="1.5" />
            <text x={plotLeft - 14} y={sy(tick) + 5} textAnchor="end" fill="#111827" fontSize="14" fontWeight="700">{formatTick(tick)}</text>
          </g>
        ))}
        <line x1={plotLeft} y1={plotBottom} x2={plotRight + 18} y2={plotBottom} stroke="#111827" strokeWidth="2" markerEnd="url(#axis-arrow)" />
        <line x1={plotLeft} y1={plotBottom} x2={plotLeft} y2={plotTop - 18} stroke="#111827" strokeWidth="2" markerEnd="url(#axis-arrow)" />
        <line x1={sx(lineStart.x)} y1={sy(lineStart.y)} x2={sx(lineEnd.x)} y2={sy(lineEnd.y)} stroke="#2dd4bf" strokeWidth="4" strokeLinecap="round" />
        {result.residuals.map((point) => (
          <circle key={point.id} cx={sx(point.n)} cy={sy(point.d)} r={result.outlierIds.includes(point.id) ? 7 : 6} fill={result.outlierIds.includes(point.id) ? "#f59e0b" : "#3b82f6"} />
        ))}
        <rect x={plotLeft + 10} y="24" width="380" height="38" rx="10" fill="rgba(255,255,255,0.86)" stroke="#bfdbfe" />
        <text x={plotLeft + 26} y="49" fill="#111827" fontSize="17" fontWeight="800">d = {result.slope}N + {result.intercept}，R² = {result.r2}</text>
        <text x={plotRight - 46} y={plotBottom + 58} fill="#111827" fontSize="16" fontWeight="800">N/条</text>
        <text x={plotLeft - 58} y={plotTop - 4} fill="#111827" fontSize="16" fontWeight="800">d/mm</text>
      </svg>
    </div>
  );
}

function ReportPage({ state, report, onWrongPractice, onPracticeModule, onHome, extensionState, selectedExtension }: any) {
  const typeDone = (type: Question["type"]) => questionBank.filter((q) => q.type === type && state.records[q.id]).length;
  const representativeQa = (extensionState?.messages ?? [])
    .reduce((pairs: Array<{ question: string; answer: string }>, message: ChatMessage, index: number, messages: ChatMessage[]) => {
      if (message.role === "user" && messages[index + 1]?.role === "assistant") {
        pairs.push({ question: message.content, answer: messages[index + 1].content });
      }
      return pairs;
    }, [])
    .slice(0, 3);
  const viewedResources = Object.values(extensionState?.viewedResourceTitles ?? {});
  return (
    <section className="space-y-6">
      <SectionHeader title="学习报告" subtitle="从总分走向知识点诊断：哪些会了，哪些还要在实验前补强。" />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="学生" value={state.studentName || "未填写"} />
        <Metric label="总体正确率" value={`${report.accuracy}%`} />
        <Metric label="首次正确率" value={`${report.firstAccuracy}%`} />
        <Metric label="预习要求" value={report.completed && report.accuracy >= 70 ? "已达到" : "需继续"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Panel title="各知识模块掌握度" icon={<BarChart3 size={18} />}>
          <div className="space-y-4">
            {report.diagnostics.map((item: any) => (
              <div key={item.module}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span>{item.module}</span>
                  <span className="text-cyanbeam">{item.mastery} · {item.score}</span>
                </div>
                <ProgressBar value={item.score} />
                {item.weakReasons.length > 0 && <p className="mt-1 text-xs text-slate-400">{item.weakReasons.join("；")}</p>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="题型完成情况" icon={<ClipboardList size={18} />}>
          <div className="space-y-3">
            <TypeProgress label="选择题" done={typeDone("choice")} total={questionStats.choice} />
            <TypeProgress label="判断题" done={typeDone("judgement")} total={questionStats.judgement} />
            <TypeProgress label="简答题" done={typeDone("short")} total={questionStats.short} />
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-300">
            正式实验前建议重点关注：粗调等光程、两束返回光斑重合、放入扩束镜后观察圆环、单向缓慢转动微动手轮、完整计数条纹、用多组数据线性拟合。
          </div>
        </Panel>
      </div>
      <Panel title="个性化复习建议" icon={<BrainCircuit size={18} />}>
        <div className="grid gap-4 md:grid-cols-2">
          {report.recommendations.length ? report.recommendations.map((item: any) => (
            <div key={item.module} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-cyanbeam">{item.module}</h3>
              <p className="mt-2 text-sm text-slate-300">错误原因：{item.reason}</p>
              <p className="mt-2 text-sm text-slate-300">建议复习：{item.review}</p>
              <p className="mt-2 text-sm text-slate-400">原错题：{item.weakQuestionIds?.join("、") || "无"}</p>
              <p className="mt-2 text-sm text-slate-400">推荐新题：{item.questionIds.join("、")}</p>
              <button className="mt-3 btn-secondary" onClick={() => onPracticeModule(item.module)}>进入巩固练习</button>
            </div>
          )) : <p className="text-slate-300">目前没有明显薄弱模块，可以重练挑战题巩固表达。</p>}
        </div>
      </Panel>
      <Panel title="拓展实验与改进方向" icon={<Sparkles size={18} />}>
        {selectedExtension ? (
          <div className="space-y-4 text-sm leading-7 text-slate-300">
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-cyanbeam">选择方向：{selectedExtension.title}</p>
              <p className="mt-2">拓展原理：{selectedExtension.principle}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-cyanbeam">学习任务完成情况</p>
              <p className="mt-2">已查看资料或视频：{viewedResources.length ? viewedResources.join("；") : "暂未记录资料查看"}</p>
              <p className="mt-2">已完成 {extensionState.completedQuestionIds.length}/{selectedExtension.questions.length} 道拓展思考题。</p>
              <p className="mt-2">完成题目：{selectedExtension.questions.filter((question: any) => extensionState.completedQuestionIds.includes(question.id)).map((question: any) => question.question).join("；") || "暂未完成拓展思考题"}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-cyanbeam">智能问答记录</p>
              {representativeQa.length ? representativeQa.map((qa: any, index: number) => (
                <div key={`${qa.question}-${index}`} className="mt-3 border-t border-white/10 pt-3">
                  <p className="text-slate-100">问：{qa.question}</p>
                  <div className="mt-1 line-clamp-4"><MarkdownMessage content={`答：${qa.answer}`} /></div>
                </div>
              )) : <p className="mt-2">暂未记录拓展方向智能问答。</p>}
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-cyanbeam">个人总结</p>
              <p className="mt-2">{extensionState.summary || selectedExtension.defaultSummary}</p>
              {!extensionState.reportAdded && <p className="mt-2 text-warm">提示：可在“数据处理”模块点击“加入实验报告”确认本次拓展记录。</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-7 text-slate-300">完成基础波长测量后，可在“数据处理”模块选择一个拓展实验方向，并将学习记录加入报告。</p>
        )}
      </Panel>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={onWrongPractice}><RefreshCcw size={17} />重新练习错题</button>
        <button className="btn-secondary" onClick={() => window.print()}><Printer size={17} />打印报告</button>
        <button className="btn-secondary" onClick={() => window.print()}><Download size={17} />导出学习报告</button>
        <button className="btn-secondary" onClick={onHome}><Home size={17} />返回首页</button>
      </div>
    </section>
  );
}

function TeacherPage({ state, loadDemo, clearData }: { state: StudyState; loadDemo: () => void; clearData: () => void }) {
  const diagnostics = generateLearningDiagnostics(state);
  return (
    <section className="space-y-6">
      <SectionHeader title="教师展示模式" />
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={loadDemo}>一键生成演示用模拟数据</button>
        <button className="btn-secondary" onClick={clearData}>清空本地演示数据</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title="题库结构与标签" icon={<ClipboardList size={18} />}>
          <div className="max-h-[620px] space-y-3 overflow-auto pr-2">
            {questionBank.map((q) => (
              <details key={q.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                <summary className="cursor-pointer text-sm font-semibold">{q.id} · {typeLabel[q.type]} · {q.difficulty} · {q.question}</summary>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>标签：{q.module.join("、")}</p>
                  <p>答案：{q.correctAnswer ?? q.referenceAnswer}</p>
                  <p>解析：{q.explanation}</p>
                  <p>追问：{q.followUpQuestions.join("；")}</p>
                </div>
              </details>
            ))}
          </div>
        </Panel>
        <Panel title="本地学情概览" icon={<BarChart3 size={18} />}>
          <div className="space-y-4">
            {diagnostics.map((item) => (
              <div key={item.module}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{item.module}</span>
                  <span className="text-cyanbeam">{item.mastery}</span>
                </div>
                <ProgressBar value={item.score} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function AssistantCard({ open, setOpen, progress, diagnostics, recommendations }: any) {
  const weakest = diagnostics.filter((item: any) => item.attempted > 0).sort((a: any, b: any) => a.score - b.score)[0];
  return (
    <div className="assistant-card fixed bottom-5 right-5 z-40 max-w-[calc(100vw-2rem)]">
      {!open ? (
        <button className="btn-primary rounded-full shadow-glow" onClick={() => setOpen(true)}><Sparkles size={18} />迈小测</button>
      ) : (
        <div className="w-80 rounded-lg border border-cyanbeam/30 bg-panel/95 p-4 shadow-glow backdrop-blur">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-cyanbeam"><Sparkles size={18} />迈小测</h3>
            <button className="text-slate-400 hover:text-white" onClick={() => setOpen(false)} aria-label="收起迈小测">×</button>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            当前预习进度 {progress}%。{weakest ? ` 目前最需要关注：${weakest.module}。` : " 先从预习引导开始建立光路模型。"}
          </p>
          {recommendations[0] && <p className="mt-3 rounded-md bg-cyanbeam/10 p-3 text-sm leading-6 text-slate-200">{recommendations[0].review}</p>}
        </div>
      )}
    </div>
  );
}

function MobileTabBar({ view, setView }: { view: ViewName; setView: (view: ViewName) => void }) {
  const items: Array<{ view: ViewName; match?: ViewName[]; icon: ReactNode; label: string }> = [
    { view: "home", icon: <Home size={18} />, label: "首页" },
    { view: "precheck", match: ["precheck", "quiz"], icon: <ClipboardList size={18} />, label: "检测" },
    { view: "classroomQa", icon: <MessageCircle size={18} />, label: "问答" },
    { view: "dataLab", icon: <Calculator size={18} />, label: "数据" },
    { view: "report", icon: <BarChart3 size={18} />, label: "报告" }
  ];
  return (
    <nav className="mobile-bottom-nav">
      {items.map((item) => {
        const active = item.view === view || item.match?.includes(view);
        return (
          <button key={item.label} className={active ? "active" : ""} onClick={() => setView(item.view)}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return <button className={`nav-btn ${active ? "nav-btn-active" : ""}`} onClick={onClick}>{icon}<span className="hidden sm:inline">{label}</span></button>;
}

function Panel({ title, icon, children }: any) {
  return (
    <section className="rounded-lg border border-white/10 bg-panel/75 p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-100">{icon}<span>{title}</span></h2>
      {children}
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <p className="text-sm text-cyanbeam">Michelson Interferometer</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-3xl text-slate-300">{subtitle}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-gradient-to-r from-cyanbeam via-optic to-violetbeam transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function TypeProgress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm"><span>{label}</span><span>{done}/{total}</span></div>
      <ProgressBar value={Math.round((done / total) * 100)} />
    </div>
  );
}

function OpticBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(94,234,212,0.14),transparent_24%),radial-gradient(circle_at_18%_30%,rgba(96,165,250,0.16),transparent_22%)]" />
      <div className="absolute left-[-10%] top-[20%] h-[460px] w-[460px] rounded-full border border-cyanbeam/10" />
      <div className="absolute left-[-6%] top-[26%] h-[350px] w-[350px] rounded-full border border-optic/10" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-space to-transparent" />
    </div>
  );
}
