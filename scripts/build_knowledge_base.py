from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "data" / "knowledgeBase.ts"
SOURCE_GROUPS = [
    (ROOT / "docs" / "知网", "base"),
    (ROOT / "docs" / "知网2-拓展实验", "extension"),
    (ROOT / "实验和拓展", "extension"),
]

KEYWORDS = [
    "迈克尔逊",
    "迈克耳孙",
    "分光板",
    "补偿板",
    "光程差",
    "等倾",
    "等厚",
    "干涉条纹",
    "圆环",
    "条纹",
    "波长",
    "最小二乘",
    "线性拟合",
    "回程差",
    "误差",
    "读数",
    "调节",
    "光斑",
    "反射镜",
    "白光干涉",
    "零光程差",
    "彩色条纹",
    "相干长度",
    "步进电机",
    "自动控制",
    "压电陶瓷",
    "压电常数",
    "逆压电效应",
    "光电探测器",
    "自动计数",
    "图像识别",
    "透明薄片",
    "折射率",
    "钠黄光",
    "双线波长差",
    "M1",
    "M2",
    "实验"
]


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"([。！？；])", r"\1\n", text)
    return text.strip()


def score(text: str) -> int:
    return sum(text.count(keyword) for keyword in KEYWORDS)


def split_chunks(text: str, size: int = 420, overlap: int = 80) -> list[str]:
    compact = re.sub(r"\s+", " ", text).strip()
    chunks: list[str] = []
    start = 0
    while start < len(compact):
        chunk = compact[start : start + size].strip()
        if len(chunk) >= 80:
            chunks.append(chunk)
        start += size - overlap
    return chunks


def main() -> None:
    records = []
    for source_dir, library in SOURCE_GROUPS:
        if not source_dir.exists():
            continue
        for pdf in sorted(source_dir.rglob("*.pdf")):
            try:
                with pdfplumber.open(pdf) as doc:
                    for index, page in enumerate(doc.pages, start=1):
                        text = clean_text(page.extract_text() or "")
                        if not text:
                            continue
                        for chunk in split_chunks(text):
                            relevance = score(chunk)
                            if relevance >= 2:
                                records.append(
                                    {
                                        "id": f"K{len(records) + 1:04d}",
                                        "source": str(pdf.relative_to(ROOT)),
                                        "page": index,
                                        "title": pdf.stem,
                                        "text": chunk,
                                        "keywords": [keyword for keyword in KEYWORDS if keyword in chunk][:8],
                                        "score": relevance,
                                        "library": library,
                                    }
                                )
            except Exception as exc:
                print(f"skip {pdf.name}: {exc}")

    # 控制前端包体积：每篇最多保留前若干个高相关片段，同时保留总体高分片段。
    by_source: dict[str, list[dict]] = {}
    for record in sorted(records, key=lambda item: item["score"], reverse=True):
        by_source.setdefault(record["source"], [])
        if len(by_source[record["source"]]) < 5:
            by_source[record["source"]].append(record)
    selected_by_source = [item for items in by_source.values() for item in items]
    base_selected = [
        item for item in selected_by_source if item.get("library") == "base"
    ]
    extension_selected = [
        item for item in selected_by_source if item.get("library") == "extension"
    ]
    base_selected = sorted(base_selected, key=lambda item: (item["source"], item["page"], item["id"]))[:170]
    extension_selected = sorted(extension_selected, key=lambda item: (item["source"], item["page"], item["id"]))[:90]
    selected = base_selected + extension_selected

    fallback = [
        {
            "id": "K0000",
            "source": "迈克耳孙干涉仪课前预习问答题（含答案）.docx",
            "page": 0,
            "title": "课程题库与参考答案",
            "text": "可动镜沿光轴移动 Δx 时，光到达镜面多走或少走 Δx，反射返回时再多走或少走 Δx，所以该光臂总光程改变 2Δx。若中心完整吞入或吐出 N 条条纹，则 2Δx=Nλ，因此 λ=2Δx/N。",
            "keywords": ["光程差", "条纹", "波长"],
            "score": 99,
            "library": "base",
        }
    ]
    selected = fallback + selected

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "export interface KnowledgeChunk {\n"
        "  id: string;\n"
        "  source: string;\n"
        "  page: number;\n"
        "  title: string;\n"
        "  text: string;\n"
        "  keywords: string[];\n"
        "  score: number;\n"
        "  library: \"base\" | \"extension\";\n"
        "}\n\n"
        "export const knowledgeBase: KnowledgeChunk[] = "
        + json.dumps(selected, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {len(selected)} chunks to {OUTPUT}")


if __name__ == "__main__":
    main()
