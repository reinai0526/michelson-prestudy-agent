import { knowledgeBase } from "../data/knowledgeBase";
import type { Question, RagSource } from "../types";

const STOP_WORDS = new Set(["为什么", "什么", "怎么", "如何", "进行", "一个", "需要", "可以", "应该", "是否", "以及"]);

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[，。！？、；：,.!?;:\s]/g, "");
}

function buildSourceUrl(source: string) {
  const fileName = source.split("/").pop() ?? source;
  if (source.startsWith("docs/知网2-拓展实验/")) {
    return `/extension-assets/papers/${encodeURIComponent(fileName)}`;
  }
  if (source.includes("测量压电陶瓷的压电常数/压电陶瓷实验指导书.pdf")) {
    return "/extension-assets/piezo/piezo-guide.pdf";
  }
  if (source.includes("测量透明薄片折射率与测量钠黄光双线波长差/实验指导书.pdf")) {
    return "/extension-assets/thin-sodium/guide.pdf";
  }
  return "";
}

function cleanSnippet(text: string) {
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[�□■◆◇●○△▽]+/g, " ")
    .replace(/[A-Za-z]?\d+(?:[．.]\d+)?\s*[=＋+\-－×x*/]\s*[A-Za-z]?\d+(?:[．.]\d+)?/g, " ")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9，。；：、（）()《》“”""％%·\-—\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 45 ? cleaned.slice(0, 180) : "";
}

function tokenize(query: string) {
  const normalized = normalizeText(query);
  const terms = [
    ...Array.from(normalized.matchAll(/[a-zA-Z0-9]+/g)).map((match) => match[0]),
    ...Array.from(normalized.matchAll(/[\u4e00-\u9fa5]{2,}/g)).flatMap((match) => {
      const word = match[0];
      const grams: string[] = [];
      for (let i = 0; i < word.length - 1; i += 1) grams.push(word.slice(i, i + 2));
      for (let i = 0; i < word.length - 2; i += 1) grams.push(word.slice(i, i + 3));
      return [word, ...grams];
    })
  ];
  return Array.from(new Set(terms.filter((term) => term.length > 1 && !STOP_WORDS.has(term))));
}

function classifyQuestion(question: string) {
  const text = normalizeText(question);
  if (/调|重合|条纹.*不|看不到|光斑|故障|怎么办|现象/.test(text)) return "operation";
  if (/误差|拟合|数据|不确定度|回程差|单向/.test(text)) return "data";
  return "theory";
}

export interface RagAnswerOptions {
  directionTitle?: string;
  keywords?: string[];
  mode?: "classroom" | "extension" | "practice";
}

function deepSeekApiUrl() {
  return import.meta.env.VITE_DEEPSEEK_API_URL || "/api/deepseek-chat";
}

function cleanStudentAnswer(answer: string) {
  return answer
    .replace(/^本回答已参考课程资料库内容生成。[ \t]*\n*/g, "")
    .replace(/^以下解释基于课程实验资料整理。[ \t]*\n*/g, "")
    .replace(/资料依据[:：][\s\S]*$/g, "")
    .replace(/参考资料[:：][\s\S]*$/g, "")
    .replace(/参见资料\s*\[[^\]]+\]/g, "")
    .replace(/\[(\d+(,\s*\d+)*)\]/g, "")
    .trim();
}

export function searchKnowledgeBase(query: string, limit = 5, library?: "base" | "extension"): RagSource[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  return knowledgeBase
    .filter((chunk) => !library || chunk.library === library)
    .map((chunk) => {
      const haystack = normalizeText(`${chunk.title}${chunk.keywords.join("")}${chunk.text}`);
      const hitScore = terms.reduce((sum, term) => sum + (haystack.includes(term) ? Math.min(6, term.length) : 0), 0);
      const keywordBonus = chunk.keywords.some((keyword) => normalizeText(query).includes(normalizeText(keyword))) ? 8 : 0;
      return {
        id: chunk.id,
        source: chunk.source,
        page: chunk.page,
        title: chunk.title,
        snippet: cleanSnippet(chunk.text),
        score: hitScore + keywordBonus + Math.min(6, chunk.score / 4),
        library: chunk.library,
        sourceUrl: buildSourceUrl(chunk.source)
      };
    })
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function searchDirectionMaterials(title: string, keywords: string[], limit = 5): RagSource[] {
  const expandedQuery = `${title} ${keywords.join(" ")}`;
  const normalizedKeywords = keywords.map(normalizeText).filter(Boolean);
  return searchKnowledgeBase(expandedQuery, 24, "extension")
    .filter((item) => {
      const haystack = normalizeText(`${item.title}${item.source}${item.snippet}`);
      return normalizedKeywords.some((keyword) => haystack.includes(keyword));
    })
    .filter((item, index, items) => items.findIndex((other) => other.source === item.source) === index)
    .slice(0, limit);
}

function buildTheoryAnswer(question: string, sources: RagSource[]) {
  const lower = normalizeText(question);
  let explanation = "同一束光经分光板分成两臂，分别传播后再合成；两臂光程差改变时，干涉级次和条纹状态随之改变。";
  let formula = "$$\\Delta = 2d\\cos\\theta$$\n中心附近 $\\theta \\approx 0$ 时，$\\Delta \\approx 2d$；可动镜移动 $\\Delta x$ 时，$2\\Delta x=N\\lambda$。";
  let pitfall = "易错点：不要把单程位移 Δx 误当成光程差变化，也不要把条纹形态和光源亮度混为一谈。";

  if (lower.includes("补偿板")) {
    explanation = "补偿板用于补偿两束光在分光板玻璃中通过次数不同带来的附加光程差和色散影响，使两臂在玻璃中的传播条件尽量一致。";
    pitfall = "易错点：补偿板不是用来改变频率，也不是简单保证空气几何路程完全相等。";
  } else if (lower.includes("2d") || lower.includes("光程差") || lower.includes("移动")) {
    explanation = "可动镜移动 d 后，光在该臂去程多走 d，反射回程再多走 d，所以光程差变化为 2d。";
  } else if (lower.includes("圆环") || lower.includes("等倾")) {
    explanation = "当两等效反射面近似平行时形成等倾干涉，同一级条纹对应相同倾角 θ，在观察屏上常表现为同心圆环。";
  } else if (lower.includes("疏") || lower.includes("密")) {
    explanation = "条纹疏密变化反映等效光程差和干涉级次分布在改变。调节可动镜或镜面夹角时，圆环会吞入、吐出或疏密变化。";
  }

  return `**简要回答**\n${explanation}\n\n**原理解释**\n迈克耳孙干涉仪把微小位移转化为光程差变化，再转化为可观察的条纹变化。理解时要抓住“分光、两臂传播、反射返回、重新合成”这条主线。\n\n**关键公式**\n${formula}\n\n**易错点提醒**\n${pitfall}`;
}

function buildOperationAnswer(question: string, sources: RagSource[]) {
  return `**现象判断**\n先区分是“完全无条纹”“条纹很模糊”，还是“两束返回光斑不能重合”。不同现象对应的调节重点不同。\n\n**可能原因**\n两臂光程差未进入相干长度范围、M1/M2 反射镜角度不合适、返回光没有空间重合、扩束前未完成小光斑重合，或微动手轮反向造成回程差。\n\n**调节建议**\n1. 先不用扩束镜，观察两束返回小光斑。\n2. 通过反射镜调节螺钉让两个返回光斑尽量重合。\n3. 粗调可动镜位置，使两臂接近等光程。\n4. 再放入扩束镜，细调镜面平行度，寻找稳定圆环或条纹。\n5. 正式测量时保持微动鼓轮单向、缓慢、连续转动。\n\n**注意事项**\n不要直视激光或镜面反射光；不要在正式读数中来回转动手轮；条纹计数以完整吞入或吐出为准。`;
}

function buildDataAnswer() {
  return `**计算思路**\n把条纹变化数 $N$ 作为横坐标，把反射镜末位置 $d$ 作为纵坐标，做线性拟合。\n\n**使用公式**\n$$d=mN+b$$\n$$2d=N\\lambda$$\n$$\\lambda=2m$$\n若 $m$ 的单位是 mm/条纹，则\n$$\\lambda(\\mathrm{nm})=2m\\times10^6$$\n\n**结果判断**\n拟合直线越稳定、$R^2$ 越接近 1，说明数据线性越好。测得波长应接近 He-Ne 激光理论值 $632.8\\ \\mathrm{nm}$。\n\n**误差来源提醒**\n重点检查条纹漏数或多数、读数误差、微动鼓轮反向造成的回程差、圆环中心漂移和仪器振动。`;
}

export function generateRagAnswer(question: string) {
  const sources = searchKnowledgeBase(question, 5);
  if (sources.length < 2 || sources[0].score < 12) {
    return {
      answer: "当前课程资料库中没有检索到充分依据，建议结合教师讲解或实验指导书进一步确认。",
      sources
    };
  }
  const kind = classifyQuestion(question);
  const answer = kind === "operation" ? buildOperationAnswer(question, sources) : kind === "data" ? buildDataAnswer() : buildTheoryAnswer(question, sources);
  return { answer, sources };
}

export async function generateAnswerWithModel(question: string, options: RagAnswerOptions = {}) {
  const expandedQuestion = options.keywords?.length
    ? `${options.directionTitle ?? ""} ${options.keywords.join(" ")} ${question}`
    : question;
  const extensionSources = options.mode === "extension" ? searchKnowledgeBase(expandedQuestion, 5, "extension") : [];
  const sources = options.mode === "extension"
    ? [
        ...extensionSources,
        ...searchKnowledgeBase(expandedQuestion, 5)
          .filter((source) => !extensionSources.some((extensionSource) => extensionSource.id === source.id))
          .slice(0, Math.max(0, 5 - extensionSources.length))
      ]
    : searchKnowledgeBase(expandedQuestion, 5, "base");
  if (sources.length < 2 || sources[0].score < 12) {
    return {
      answer:
        options.mode === "extension"
          ? "当前拓展资料库中没有检索到充分依据，建议结合教师指导进一步确认。"
          : "当前课程资料库中没有检索到充分依据，建议结合教师讲解或实验指导书进一步确认。",
      sources
    };
  }

  try {
    const response = await fetch(deepSeekApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        sources,
        kind: classifyQuestion(question),
        mode: options.mode ?? "classroom",
        directionTitle: options.directionTitle,
        directionKeywords: options.keywords
      })
    });
    const data = await response.json();
    if (response.ok && data?.answer) {
      return {
        answer: cleanStudentAnswer(data.answer),
        sources
      };
    }
    return {
      answer:
        options.mode === "extension"
          ? buildExtensionAnswer(options.directionTitle ?? "拓展实验", question)
          : generateRagAnswer(question).answer,
      sources
    };
  } catch {
    // 本地代理未启动或网络不可用时，保持课堂演示功能不中断。
    return options.mode === "extension"
      ? { answer: buildExtensionAnswer(options.directionTitle ?? "拓展实验", question), sources }
      : generateRagAnswer(question);
  }
}

function buildExtensionAnswer(directionTitle: string, question: string) {
  return `**简要回答**\n这个问题可以放在“${directionTitle}”方向中理解：核心是把迈克耳孙干涉仪对光程差变化的高灵敏响应，迁移到新的光源、驱动方式、被测对象或检测方式中。\n\n**原理解释**\n拓展实验仍然围绕“微小变化 → 光程差变化 → 条纹或信号变化 → 定量反推”这条主线。不同方向改变的是光源、执行机构、样品或探测器。\n\n**与迈克耳孙干涉仪的联系**\n基础实验测量激光波长，拓展实验则把同一干涉测量思想用于彩色条纹观察、自动控制、微小形变测量或智能计数。\n\n**实验实现思路**\n先明确被改变的物理量，再建立它与反射镜位移或光程差的关系，最后用条纹变化数、光强信号或图像特征进行判断。\n\n**注意事项或易错点**\n不要只关注装置变化，要始终回到光程差和条纹变化之间的定量关系。`;
}

function parseGeneratedQuestions(raw: string, module: string): Question[] {
  const jsonText = raw.match(/\[[\s\S]*\]/)?.[0] ?? "";
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as Array<Partial<Question>>;
    return parsed
      .filter((item) => item.question && item.type)
      .slice(0, 2)
      .map((item, index) => ({
        id: `AI-${normalizeText(module).slice(0, 8)}-${Date.now()}-${index + 1}`,
        type: item.type === "judgement" || item.type === "short" ? item.type : "choice",
        module: [module],
        difficulty: "中等",
        question: String(item.question),
        options: item.options,
        correctAnswer: item.correctAnswer,
        explanation: String(item.explanation || "本题用于巩固该薄弱知识点，请围绕光路、光程差和条纹变化进行分析。"),
        keywords: item.keywords?.length ? item.keywords : [module],
        requiredPoints: item.requiredPoints?.length ? item.requiredPoints : [module],
        commonMistakes: [{ pattern: "概念混淆", message: "请先定位题目对应的物理量，再写出判断依据。" }],
        hints: ["先判断这个问题对应哪一个光路或数据处理环节。", "再把它与光程差、条纹数或仪器结构联系起来。"],
        followUpQuestions: ["这个结论能否用光程差或条纹变化再解释一次？"],
        recommendation: `继续围绕“${module}”完成变式巩固。`,
        score: 3
      }));
  } catch {
    return [];
  }
}

export async function generateReinforcementQuestionsWithModel(module: string, weakQuestionIds: string[], count = 2): Promise<Question[]> {
  const sources = searchKnowledgeBase(module, 5);
  if (sources.length < 2) return [];
  try {
    const response = await fetch(deepSeekApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: `请根据薄弱知识点“${module}”生成 ${count} 道新的巩固题。不要重复这些原错题编号：${weakQuestionIds.join("、")}。题目要围绕迈克耳孙干涉仪实验，改变题干和考查角度。`,
        sources,
        kind: "practice",
        mode: "practice",
        directionTitle: module,
        directionKeywords: [module]
      })
    });
    const data = await response.json();
    if (!response.ok || !data?.answer) return [];
    return parseGeneratedQuestions(data.answer, module);
  } catch {
    return [];
  }
}
