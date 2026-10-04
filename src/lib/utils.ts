import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { convertFileSrc } from "@tauri-apps/api/core"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 이미 URL(http/https/data/blob/asset)인 경우 */
const URL_LIKE = /^(https?:|data:|blob:|asset:)/i
/** 윈도우 드라이브(C:\ , C:/), POSIX 루트(/), UNC(\\) */
const ABSOLUTE_PATH = /^([a-zA-Z]:[\\/]|\/|\\\\)/

/**
 * 프로젝트 경로 + 상대 경로를 하나의 절대 경로로 합친다. (구분자는 '/'로 정규화)
 * relativePath가 이미 절대 경로면 그대로 반환한다.
 */
export function resolveProjectPath(projectPath: string, relativePath: string): string {
  if (ABSOLUTE_PATH.test(relativePath)) return relativePath.replace(/\\/g, "/")
  const base = projectPath.replace(/\\/g, "/").replace(/\/+$/, "")
  const rel = relativePath.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "")
  return base ? `${base}/${rel}` : rel
}

/**
 * 로컬 미디어 경로를 웹뷰에서 로드 가능한 URL(asset 프로토콜)로 변환한다.
 * - 빈 경로 → undefined (img/video src에 그대로 할당 가능)
 * - 이미 URL이면 변환하지 않음
 * - 변환 실패(비-Tauri 환경 등) 시 undefined
 */
export function getAssetUrl(projectPath: string | undefined | null, relativePath: string | undefined | null): string | undefined {
  if (!relativePath) return undefined
  if (URL_LIKE.test(relativePath)) return relativePath
  try {
    return convertFileSrc(resolveProjectPath(projectPath ?? "", relativePath))
  } catch {
    return undefined
  }
}
