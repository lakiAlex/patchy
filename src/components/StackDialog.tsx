import { useEffect, useState } from "react";
import { DEFAULT_STACK, type Stack } from "../lib/watch";

const FIELDS: { key: keyof Stack; label: string; hint: string; wide?: boolean }[] = [
  { key: "wpPlugins", label: "WordPress plugins", hint: "Slugs from wordpress.org, one per line", wide: true },
  { key: "wpThemes", label: "WordPress themes", hint: "Theme slugs" },
  { key: "wpCore", label: "WordPress core", hint: '"latest" or branches such as 7.0' },
  { key: "php", label: "PHP branches", hint: "Such as 8.3" },
  { key: "composer", label: "Composer packages", hint: "Such as laravel/framework" },
  { key: "npm", label: "npm packages", hint: "Such as next" },
  { key: "node", label: "Node.js majors", hint: "Such as 24" },
  { key: "ubuntu", label: "Ubuntu releases", hint: "Codenames: noble, jammy" },
  { key: "ubuntuPackages", label: "Ubuntu packages", hint: '"linux" also matches linux-aws, "php" matches php8.3' },
  { key: "nginx", label: "nginx branches", hint: "Such as 1.24" },
  { key: "mysql", label: "MySQL branches", hint: "Such as 8.0" },
  { key: "mariadb", label: "MariaDB branches", hint: "Such as 10.11" },
];

const toText = (s: Stack) => Object.fromEntries(FIELDS.map((f) => [f.key, s[f.key].join("\n")])) as Record<keyof Stack, string>;

export function StackDialog(props: {
  stack: Stack;
  onSave: (stack: Stack) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => toText(props.stack));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const save = () => {
    const stack = { ...props.stack };
    for (const f of FIELDS) {
      stack[f.key] = [...new Set(text[f.key].split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
    }
    props.onSave(stack);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog stack-dialog" role="dialog" aria-label="Stack">
        <div className="dialog-header">
          <h2>Stack</h2>
        </div>
        <div className="dialog-body">
          <p className="dialog-message">What Patchy watches. One entry per line.</p>
          <div className="stack-fields">
            {FIELDS.map((f) => (
              <label key={f.key} className={`field${f.wide ? " wide" : ""}`}>
                <span>{f.label}</span>
                <textarea
                  rows={f.wide ? 6 : 4}
                  spellCheck={false}
                  value={text[f.key]}
                  onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))}
                />
                <span className="hint">{f.hint}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="dialog-footer">
          <button type="button" className="button ghost" onClick={() => setText(toText(DEFAULT_STACK))}>
            Reset to defaults
          </button>
          <span className="spacer" />
          <button type="button" className="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={save}>
            Save and refresh
          </button>
        </div>
      </div>
    </div>
  );
}
