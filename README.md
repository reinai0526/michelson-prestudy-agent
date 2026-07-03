# 迈克耳孙干涉仪智能预习平台

面向“迈克耳孙干涉仪及激光波长测量”课程的网页版智能教学平台。项目包含课前引导、课前预习检测、课中 RAG 智能问答、波长测量数据处理、知识诊断、个性化推荐、学习报告和教师展示模式。

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- lucide-react 图标
- localStorage 本地保存学习记录
- 前端本地 RAG 检索与规则生成，预留大模型 API 接口
- 波长测量线性拟合、误差与不确定度分析

新增依赖：

```bash
npm install -D @types/react @types/react-dom
```

用途：补齐 React/JSX 的 TypeScript 类型声明，保证 `npm run build` 可正常通过。

## 启动方法

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的本地地址，默认通常为 `http://127.0.0.1:5173/`。

本项目需要本机已安装 Node.js 与 npm。当前代码不依赖后端服务，安装完成后即可本地运行。

## 接入 DeepSeek

当前项目已经内置 DeepSeek 代理接口。不要把 API Key 写进前端代码。

1. 在项目根目录复制一份环境变量文件：

```bash
cp .env.example .env.local
```

2. 打开 `.env.local`，填入自己的 DeepSeek API Key：

```text
DEEPSEEK_API_KEY=sk-你的真实Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_PROXY_PORT=8787
```

3. 打开第一个终端，启动 DeepSeek 本地代理：

```bash
npm run deepseek:server
```

看到类似下面信息即可：

```text
DeepSeek proxy listening on http://127.0.0.1:8787
API key configured: yes
```

4. 打开第二个终端，启动前端：

```bash
npm run dev
```

5. 浏览器进入“智能问答”页面提问。系统流程为：

```text
学生问题 -> 检索 docs/知网 资料片段 -> 发送问题和片段给 DeepSeek -> 返回带依据的回答
```

如果没有启动代理或没有配置 Key，页面会自动退回本地 RAG 规则回答，不会影响其他功能。

## 项目结构

```text
docs/迈克耳孙干涉仪课前预习问答题（含答案）.docx  原始题库文档
docs/知网/                                        论文与课程资料 PDF
src/data/questionBank.ts                           结构化题库
src/data/knowledgeBase.ts                          从 docs/知网 抽取的 RAG 知识片段
src/services/agent.ts                              迈小测规则诊断、追问、推荐、报告服务
src/services/rag.ts                                本地 RAG 检索、提示词与回答生成接口
src/services/wavelength.ts                         波长拟合、误差和不确定度计算
src/services/storage.ts                            localStorage 读写与演示数据
server/deepseek-proxy.mjs                          DeepSeek 本地代理，保护 API Key
scripts/build_knowledge_base.py                    从 PDF 生成知识库索引
src/App.tsx                                        页面与交互流程
src/styles.css                                     Tailwind 与全局样式
```

## 已实现功能

- 首页展示课程简介、预习目标、题目统计、学习进度和学生姓名输入。
- 预习引导页展示核心问题、光路思想、两倍光程差关系、条纹吞吐、安全提示。
- 支持选择题、判断题、简答题作答。
- 客观题即时判分，错误时给出常见误区提示。
- 简答题基于关键词、核心要点和逻辑覆盖率进行分层评价。
- 对核心问题提供启发式追问，先引导学生修改，再查看参考答案。
- 每题绑定知识标签，自动统计模块掌握度。
- 根据薄弱模块生成个性化复习建议和推荐重练题目。
- 错题自动加入错题本，支持错题重练。
- 刷新页面后保留学习进度、答题记录和诊断结果。
- 完成后生成学习报告，支持打印或导出为打印页面。
- 教师展示模式可查看题库结构、标签、难度、答案解析、追问设置和本地学情概览。
- 支持生成演示用模拟数据，便于讲课比赛现场展示。
- 新增“课前预习检测”入口，集中展示完成情况、错题分布和推荐练习入口。
- 新增“课中智能问答”入口，支持学生输入理论或调节问题，先检索 `docs/知网` 资料，再生成带来源片段的回答。
- 新增“波长数据处理”入口，支持手动输入或上传 CSV/TSV 数据，自动完成 `d=aN+b` 线性拟合、`λ=2a` 单位换算、相对误差、残差分析、A/B/合成不确定度和异常点提示。

## 使用说明

- 课前：进入“课前预习检测”，完成原有选择题、判断题和简答题；系统会形成错题诊断和推荐练习。
- 课中：进入“智能问答”，输入补偿板、光程差、圆环条纹或调节故障类问题；回答下方可展开查看检索依据。
- 实验后：进入“数据处理”，输入条纹变化数 `N` 和反射镜末位置 `d/mm`，查看拟合图、结果表达式和误差建议。

## 知识库更新

如果 `docs/知网` 中新增或替换了 PDF，可运行：

```bash
/Users/ruixued/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build_knowledge_base.py
```

脚本会重新生成 `src/data/knowledgeBase.ts`。当前索引是前端本地检索版本，适合比赛演示；若 PDF 为扫描件，需先 OCR 后再生成索引。

## 智能体说明

当前“迈小测”使用规则模拟智能助教能力：

- `diagnoseAnswer`：判定客观题、诊断简答题关键词与核心要点覆盖。
- `generateHint`：按题目配置给出逐级提示。
- `generateFollowUp`：根据缺失要点生成启发式追问。
- `generateLearningRecommendation`：根据模块掌握度生成个性化推荐。
- `generateLearningReport`：汇总总体正确率、首次正确率、模块掌握度和薄弱知识点。

后续接入大模型 API 时，可保留题库、页面和本地记录结构，将 `src/services/agent.ts` 中的规则函数替换为调用模型服务的实现，并继续使用现有返回数据结构。

RAG 问答的大模型接入点在 `src/services/rag.ts` 的 `generateAnswerWithModel`；DeepSeek 后端代理在 `server/deepseek-proxy.mjs`。后续可以替换为：

- 本地开源模型：Ollama、LM Studio、vLLM
- OpenAI-compatible API：DeepSeek、通义、智谱或学校私有模型网关
- 后端向量库：SQLite/LanceDB/Chroma，用后端保存 embedding 和检索结果

建议上线版本不要把 API Key 放在前端，应增加 Node/Express 或 Python/FastAPI 后端，由后端完成模型调用。
