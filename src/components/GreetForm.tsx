import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Tauri IPC `greet` 커맨드를 호출하는 폼 컴포넌트.
 * 로컬 상태(name, greetMsg)를 자체적으로 관리합니다.
 */
export function GreetForm() {
  const [name, setName] = useState("");
  const [greetMsg, setGreetMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const msg = await invoke<string>("greet", { name: name.trim() });
      setGreetMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section
      aria-label="Tauri 인사말 폼"
      className="flex flex-col gap-4 pt-6 border-t border-border"
    >
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <label htmlFor="greet-input" className="sr-only">
          이름 입력
        </label>
        <input
          id="greet-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
          autoComplete="off"
          className="
            flex-1 px-4 py-2 rounded-lg
            bg-surface-0 border border-border
            text-text-primary placeholder:text-text-tertiary
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
            transition-colors duration-150
          "
        />
        <button
          type="submit"
          disabled={isLoading || !name.trim()}
          className="
            px-6 py-2 rounded-lg font-medium
            bg-accent hover:bg-accent/85 text-canvas dark:text-text-primary
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-200 cursor-pointer
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
          "
        >
          {isLoading ? "Loading…" : "Greet Tauri"}
        </button>
      </form>

      {greetMsg && (
        <p
          role="status"
          aria-live="polite"
          className="p-4 rounded-lg bg-safe/20 text-safe font-medium"
        >
          {greetMsg}
        </p>
      )}
    </section>
  );
}
