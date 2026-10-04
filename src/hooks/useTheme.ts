import { useState, useEffect } from "react";

/**
 * 다크모드 토글 상태를 관리하는 커스텀 훅.
 * `document.documentElement`에 `dark` 클래스를 적용/제거하여
 * Tailwind v4의 class-based 다크모드를 구동합니다.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // 초기 상태: 시스템 선호 다크모드 감지
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  const toggle = () => setIsDark((prev) => !prev);

  return { isDark, toggle } as const;
}
