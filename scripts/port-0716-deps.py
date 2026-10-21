"""把 0.7.16 里的移植文件依赖闭包补齐到 sonnet。

做法：从种子文件出发，解析相对 import，凡是 sonnet 里**不存在**的文件，
就从 0.7.16 复制过来，然后继续解析新复制进来的文件，直到收敛。
已存在的文件绝不覆盖（避免动到 sonnet 自己的实现）。
"""

import os
import re
import shutil

S = r"D:\Android\folia-sonnet\src"
M = r"C:\Users\AA\WorkBuddy\2026-10-10-10-16-50\folia-major\src"

SEEDS = [
    "services/onlineMusic/qqProvider.ts",
    "services/onlineMusic/qqTransport.ts",
    "services/onlineMusic/qqNormalize.ts",
    "services/onlineMusic/bodianProvider.ts",
    "services/onlineMusic/bodianTransport.ts",
    "services/onlineMusic/bodianNormalize.ts",
    "services/onlineMusic/bodianCatalog.ts",
    "services/onlineMusic/bodianLibrary.ts",
    "services/onlineMusic/bodianMutations.ts",
    "services/onlineMusic/loginSelfCheck.ts",
    "services/onlineMusic/loginBackendDiagnostics.ts",
    "utils/lyrics/bodianLyrics.ts",
    # 已被替换为 0.7.16 版本的文件，也要继续展开它们自己的依赖
    "utils/appPlaybackHelpers.ts",
    "utils/coverUrl.ts",
    "utils/lyrics/parserCore.ts",
    "utils/qrLoginDiagnosticReport.ts",
]

IMPORT_RE = re.compile(r"""from\s+['"](\.[^'"]+)['"]""")

EXT_CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]


def resolve(base_rel: str, spec: str) -> str | None:
    """把相对 import 解析成 src 下的相对路径（不含扩展名候选）。"""
    base_dir = os.path.dirname(base_rel)
    joined = os.path.normpath(os.path.join(base_dir, spec)).replace("\\", "/")
    if joined.startswith(".."):
        return None
    return joined


def find_existing(root: str, rel_no_ext: str) -> str | None:
    for ext in EXT_CANDIDATES:
        p = os.path.join(root, rel_no_ext.replace("/", os.sep) + ext)
        if os.path.isfile(p):
            return p
    return None


def imports_of(path: str) -> list[str]:
    with open(path, encoding="utf-8", errors="ignore") as f:
        text = f.read()
    out = []
    for spec in IMPORT_RE.findall(text):
        out.append(spec)
    # 也处理 export ... from '...'
    for spec in re.findall(r"""export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"](\.[^'"]+)['"]""", text):
        out.append(spec)
    return out


def main():
    queue = list(SEEDS)
    seen = set()
    copied = []
    unresolved = []

    while queue:
        rel = queue.pop(0)
        if rel in seen:
            continue
        seen.add(rel)

        s_path = find_existing(S, rel)
        m_path = find_existing(M, rel)

        if s_path is None:
            if m_path is None:
                unresolved.append((rel, "0.7.16 里也没有"))
                continue
            # 从 0.7.16 复制
            dst = os.path.join(S, rel.replace("/", os.sep))
            for ext in EXT_CANDIDATES:
                mp = os.path.join(M, rel.replace("/", os.sep) + ext)
                if os.path.isfile(mp):
                    dst = mp.replace(M, S, 1)
                    break
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(m_path, dst)
            copied.append(rel)
            s_path = dst

        # 不论该文件是原有的还是刚复制来的，都要继续展开它的依赖，
        # 否则种子文件自身的缺失依赖永远发现不了。
        for spec in imports_of(s_path):
            target = resolve(rel, spec)
            if target:
                queue.append(target)

    print("从 0.7.16 复制进来的文件 (%d):" % len(copied))
    for c in copied:
        print("  +", c)
    if unresolved:
        print("\n仍无法解析 (%d):" % len(unresolved))
        for u, why in unresolved:
            print("  !", u, "-", why)
    else:
        print("\n依赖闭包已收敛。")


main()
