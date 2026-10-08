import { ThemePicker } from "./theme-picker";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main>
      <div className="pagehead">
        <h1>Settings</h1>
      </div>

      <h2 style={{ marginTop: 0 }}>Appearance</h2>
      <p className="muted">Choose how Proofer looks. Changes apply right away.</p>
      <ThemePicker />
    </main>
  );
}
