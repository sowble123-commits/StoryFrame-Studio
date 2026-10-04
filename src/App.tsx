import { useTheme } from "./hooks/useTheme";
import { ThemeToggle } from "./components/ThemeToggle";
import { GreetForm } from "./components/GreetForm";

function App() {
  const { isDark, toggle } = useTheme();

  return (
    <main className="min-h-screen bg-canvas text-text-primary p-8 flex flex-col items-center justify-center font-sans transition-colors duration-300">
      <div className="bg-surface-1 border border-border p-8 rounded-2xl shadow-xl max-w-xl w-full text-center space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-accent">
            StoryFrame Studio
          </h1>
          <p className="text-text-secondary text-sm">
            React 19 + Tauri 2.x + Tailwind v4 (OKLCH) Setup Complete.
          </p>
        </header>

        <ThemeToggle isDark={isDark} onToggle={toggle} />

        <GreetForm />
      </div>
    </main>
  );
}

export default App;
