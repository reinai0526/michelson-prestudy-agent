import type { Question } from "../types";

const commonMistakes = [
  { pattern: "只背公式", message: "先说明物理过程，再写公式，避免只把符号代进去。" },
  { pattern: "概念混淆", message: "把仪器元件、光程差、条纹数和数据处理步骤分开判断。" }
];

export const personalizedPracticeQuestions: Question[] = [
  {
    id: "P-INST-01",
    type: "choice",
    module: ["仪器结构"],
    difficulty: "基础",
    question: "若观察屏上始终看不到两束返回光斑的重合，优先应检查（ ）。",
    options: [
      { key: "A", text: "M1、M2 反射镜角度和分光板合束位置" },
      { key: "B", text: "激光波长理论值是否为 632.8 nm" },
      { key: "C", text: "数据拟合时是否保留三位小数" },
      { key: "D", text: "是否已经打印实验报告" }
    ],
    correctAnswer: "A",
    explanation: "干涉前必须先让两束返回光在空间上重合，重点检查反射镜调节和分光板合束。",
    keywords: ["返回光斑", "重合", "反射镜", "分光板"],
    requiredPoints: ["返回光斑需要空间重合", "调节 M1/M2 反射镜角度"],
    commonMistakes,
    hints: ["先看光路是否合到同一区域。", "没有空间重合时很难形成稳定条纹。"],
    followUpQuestions: ["两束光如果落在屏幕不同位置，哪里能发生稳定叠加？"],
    recommendation: "回看仪器结构图，按光源、G1、M1/M2、观察屏的顺序复述光路。",
    score: 3
  },
  {
    id: "P-COMP-01",
    type: "choice",
    module: ["补偿板作用"],
    difficulty: "基础",
    question: "若移去补偿板后用白光观察，最容易受到影响的是（ ）。",
    options: [
      { key: "A", text: "不同波长在玻璃中产生的附加光程差和色散补偿" },
      { key: "B", text: "激光器是否能发光" },
      { key: "C", text: "微动手轮是否能转动" },
      { key: "D", text: "观察屏的大小" }
    ],
    correctAnswer: "A",
    explanation: "补偿板主要让两臂经历等效玻璃光程，白光含多种波长，对色散补偿更敏感。",
    keywords: ["补偿板", "白光", "玻璃光程", "色散"],
    requiredPoints: ["补偿玻璃光程差", "减小色散影响"],
    commonMistakes,
    hints: ["白光包含多种波长。", "补偿板处理的是玻璃介质中的附加光程。"],
    followUpQuestions: ["为什么白光比单色激光更容易暴露补偿板问题？"],
    recommendation: "重点复习 G1 和 G2 的材料、厚度和平行关系。",
    score: 3
  },
  {
    id: "P-AMP-01",
    type: "judgement",
    module: ["分振幅干涉"],
    difficulty: "基础",
    question: "迈克耳孙干涉仪中的两束相干光本质上来自同一束入射光被半透半反膜分成的两部分。",
    correctAnswer: "true",
    explanation: "分振幅干涉的关键是同一束光经分光板分成反射和透射两束，再分别传播并合成。",
    keywords: ["同一束光", "半透半反", "分振幅"],
    requiredPoints: ["同一束光", "分光板分成两束", "再合成"],
    commonMistakes,
    hints: ["抓住分光板 G1 的半透半反作用。"],
    followUpQuestions: ["如果两束光来自两个互不相关的普通光源，相位关系还稳定吗？"],
    recommendation: "比较分振幅和分波前干涉的形成方式。",
    score: 2
  },
  {
    id: "P-OPD-01",
    type: "short",
    module: ["激光波长测量原理"],
    difficulty: "中等",
    question: "请用一句话解释：为什么反射镜移动 Δx，光程差变化不是 Δx 而是 2Δx？",
    explanation: "光在可动镜所在光臂中往返传播，去程和回程各改变 Δx。",
    keywords: ["往返", "去程", "回程", "2Δx"],
    requiredPoints: ["去程改变 Δx", "回程改变 Δx", "总变化为 2Δx"],
    commonMistakes,
    hints: ["把光到镜面前后的路径分成去程和返程。"],
    followUpQuestions: ["如果镜面后退 Δx，返程路径会不会也跟着变长？"],
    recommendation: "画出可动镜位移前后的往返光路。",
    score: 4
  },
  {
    id: "P-RING-01",
    type: "choice",
    module: ["等倾干涉与条纹变化"],
    difficulty: "基础",
    question: "等倾圆环中，同一亮环上的各点主要对应相同的（ ）。",
    options: [
      { key: "A", text: "出射倾角" },
      { key: "B", text: "光源功率" },
      { key: "C", text: "反射镜材料" },
      { key: "D", text: "读数显微镜刻度" }
    ],
    correctAnswer: "A",
    explanation: "等倾干涉中相同倾角对应相同光程差条件，因此同一级条纹呈圆环。",
    keywords: ["等倾", "倾角", "圆环"],
    requiredPoints: ["相同倾角", "相同级次", "圆环条纹"],
    commonMistakes,
    hints: ["题目里的“等倾”指向相同倾角。"],
    followUpQuestions: ["为什么相同倾角在屏上常形成圆形轨迹？"],
    recommendation: "复习等倾干涉和等厚干涉图样的区别。",
    score: 3
  },
  {
    id: "P-FRINGE-01",
    type: "choice",
    module: ["等倾干涉与条纹变化"],
    difficulty: "中等",
    question: "中心条纹每完整吞入或吐出一条，表示中心处光程差改变了（ ）。",
    options: [
      { key: "A", text: "一个波长 λ" },
      { key: "B", text: "半个波长 λ/2" },
      { key: "C", text: "两个波长 2λ" },
      { key: "D", text: "与波长无关" }
    ],
    correctAnswer: "A",
    explanation: "完整吞吐一条对应干涉级次变化 1，中心光程差改变一个波长。",
    keywords: ["吞入", "吐出", "一个波长", "级次"],
    requiredPoints: ["完整吞吐", "级次变化 1", "光程差改变 λ"],
    commonMistakes,
    hints: ["条纹数 N 本质上对应级次变化数。"],
    followUpQuestions: ["N 条完整条纹对应多少个 λ 的光程差变化？"],
    recommendation: "复习条纹数 N 与光程差变化 Nλ 的关系。",
    score: 3
  },
  {
    id: "P-WAVE-01",
    type: "short",
    module: ["激光波长测量原理"],
    difficulty: "中等",
    question: "若拟合得到 d=mN+b，为什么激光波长应由 λ=2m 得到？",
    explanation: "由 2d=Nλ 可得 d=(λ/2)N，因此斜率 m=λ/2，所以 λ=2m。",
    keywords: ["d=mN+b", "2d=Nλ", "斜率", "λ=2m"],
    requiredPoints: ["写出 2d=Nλ", "斜率 m=λ/2", "λ=2m"],
    commonMistakes,
    hints: ["把 2d=Nλ 变形成 d 关于 N 的一次函数。"],
    followUpQuestions: ["纵轴是 d 时，N 增加 1 条对应镜面位移增加多少？"],
    recommendation: "复习线性拟合斜率的物理意义和单位换算。",
    score: 4
  },
  {
    id: "P-READ-01",
    type: "judgement",
    module: ["实验调节与操作"],
    difficulty: "基础",
    question: "正式计数时若不小心反向转动微动手轮，可以直接反转回来继续记录，不会影响数据。",
    correctAnswer: "false",
    explanation: "反向转动会引入机械回程差，读数变化不一定同步反映镜面真实位移，应保持单向转动。",
    keywords: ["单向转动", "回程差", "读数"],
    requiredPoints: ["反向会产生回程差", "正式测量应单向转动"],
    commonMistakes,
    hints: ["想想丝杆和齿轮机构反向时的空程。"],
    followUpQuestions: ["回程差会让读数和镜面真实位移出现什么偏差？"],
    recommendation: "复习微动手轮读数规范和操作误差来源。",
    score: 2
  },
  {
    id: "P-DATA-01",
    type: "choice",
    module: ["误差与数据处理"],
    difficulty: "中等",
    question: "用多组 N-d 数据做线性拟合，相比只取两点计算，主要优势是（ ）。",
    options: [
      { key: "A", text: "能减小随机误差影响并发现异常点" },
      { key: "B", text: "可以不再需要条纹计数" },
      { key: "C", text: "可以改变激光真实波长" },
      { key: "D", text: "一定使所有系统误差消失" }
    ],
    correctAnswer: "A",
    explanation: "多组数据拟合能利用整体趋势估计斜率，并通过残差判断异常读数。",
    keywords: ["线性拟合", "随机误差", "异常点", "残差"],
    requiredPoints: ["利用多组数据", "减小随机误差", "发现异常点"],
    commonMistakes,
    hints: ["拟合不是改变物理量，而是更稳健地估计斜率。"],
    followUpQuestions: ["残差明显偏大的点可能来自哪些实验操作问题？"],
    recommendation: "复习最小二乘拟合、残差和不确定度分析。",
    score: 3
  },
  {
    id: "P-EXT-01",
    type: "short",
    module: ["OCT、LIGO与天琴计划等应用"],
    difficulty: "挑战",
    question: "迈克耳孙干涉仪为什么能拓展到微小形变、折射率或自动计数等实验？",
    explanation: "核心是把不易直接测量的微小变化转化为光程差变化，再通过条纹、光强或图像信号进行放大和计量。",
    keywords: ["微小变化", "光程差", "条纹", "信号"],
    requiredPoints: ["微小变化转化为光程差", "再由条纹或信号测量"],
    commonMistakes,
    hints: ["抓住“微小变化—光程差—可观察信号”的链条。"],
    followUpQuestions: ["折射率变化和反射镜位移都可以先转化成什么变化？"],
    recommendation: "把基础波长测量的思想迁移到拓展实验。",
    score: 4
  }
];
