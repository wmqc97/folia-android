// 当前文件：构建身份解析（来源仓库 + commit），供 vite.config.ts 注入 __BUILD_REPO__ / __BUILD_COMMIT__。

// 说明：本仓库根 .gitignore 里的 `build/` 规则会连 `dev/build/` 一起忽略，
// 导致部分分发副本缺少本文件，而 vite.config.ts 顶部会直接 import 它 —— 缺失时前端构建立即失败。

/**
 * 把 git remote URL 归一化成 `owner/repo`。
 *
 * 同时支持 `git@github.com:owner/repo.git` 与 `https://github.com/owner/repo.git` 两种形态。
 * 解析不出来时返回空串。
 */
export function normalizeRepoSlug(remoteUrl) {
    if (typeof remoteUrl !== 'string') return '';
    const trimmed = remoteUrl.trim();
    if (!trimmed) return '';

    const scpLike = trimmed.match(/^[^@/]+@[^:/]+:(.+)$/);
    const pathPart = scpLike ? scpLike[1] : null;

    let candidate = pathPart;
    if (!candidate) {
        try {
            candidate = new URL(trimmed).pathname;
        } catch {
            return '';
        }
    }

    const segments = candidate
        .replace(/^\/+/, '')
        .replace(/\.git$/i, '')
        .split('/')
        .filter(Boolean);

    if (segments.length < 2) return '';
    return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
}

/**
 * 解析构建来源仓库。
 *
 * 优先读 CI 平台注入的环境变量，其次才问 git remote；拿不到时返回 `unknown`
 * （buildProvenance 会把 unknown 当作非官方构建处理）。
 */
export function resolveBuildRepo(env = {}, readGitRemote = null) {
    const fromEnv = env.FOLIA_BUILD_REPO
        || env.GITHUB_REPOSITORY
        || (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
            ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
            : '')
        || (env.CI_PROJECT_PATH || '');
    if (fromEnv) {
        const slug = normalizeRepoSlug(fromEnv) || fromEnv.trim();
        return slug || 'unknown';
    }

    if (typeof readGitRemote !== 'function') return 'unknown';
    try {
        return normalizeRepoSlug(readGitRemote()) || 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * 归一化成 7 位小写十六进制 commit。
 *
 * `git rev-parse` 失败时 vite.config.ts 传进来的是 `unknown, probably dev version` 之类的文本，
 * 这类非十六进制输入统一回落成 `dev`。
 */
export function normalizeBuildCommit(commitHash) {
    if (typeof commitHash !== 'string') return 'dev';
    const trimmed = commitHash.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(trimmed)) return 'dev';
    if (/^0+$/.test(trimmed)) return 'dev';
    return trimmed.slice(0, 7).toLowerCase();
}