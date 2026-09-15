import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
export type Theme = 'system' | 'light' | 'dark';
export function savedTheme(): Theme {
  try { const value = localStorage.getItem('cc-jsonl-theme'); return value === 'light' || value === 'dark' ? value : 'system'; }
  catch { return 'system'; }
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : theme;
}
export default function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('cc-jsonl-theme', theme); } catch { /* Still apply the theme when storage is unavailable. */ }
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    const sync = (event: StorageEvent) => { if (event.key === 'cc-jsonl-theme') setTheme(savedTheme()); };
    media.addEventListener('change', update); window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', sync); };
  }, [theme]);
  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;
  return <label className="theme-select"><Icon size={15} /><span className="sr-only">화면 테마</span><select aria-label="화면 테마" value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="system">시스템</option><option value="light">밝게</option><option value="dark">어둡게</option></select></label>;
}
