interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

/**
 * 라이트/다크 모드를 전환하는 버튼 컴포넌트.
 * 접근성을 위해 aria-pressed와 aria-label을 명시합니다.
 */
export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="
        inline-flex items-center gap-2 px-5 py-2
        rounded-lg border border-border-subtle
        bg-surface-2 hover:bg-surface-3
        text-text-primary text-sm font-medium
        transition-colors duration-200 cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
      "
    >
      <span aria-hidden="true">{isDark ? "🌙" : "☀️"}</span>
      {isDark ? "Dark Mode" : "Light Mode"}
    </button>
  );
}
