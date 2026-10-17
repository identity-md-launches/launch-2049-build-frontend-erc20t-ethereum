import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  X,
  ArrowUpRight,
} from "lucide-react";
import { explorer } from "./config";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <a
      href="#/launch"
      className={`brand ${small ? "small" : ""}`}
      aria-label="ERC20T home"
    >
      <img src="./favicon.svg" width="34" height="34" alt="" />
      <span>
        ERC20<span className="brand-t">T</span>
      </span>
    </a>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  hint,
  error,
  suffix,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  suffix?: string;
}) {
  const generated = useId();
  const id = props.id || generated;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          {...props}
          id={id}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-help` : undefined}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
      {(error || hint) && (
        <p id={`${id}-help`} className={error ? "field-error" : "hint"}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {description && <span className="hint">{description}</span>}
      </span>
      <input
        className="toggle"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success" | "warning";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle size={18} className="spinner" aria-hidden="true" />;
}
export function Address({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="address-block">
      {label && <span className="hint">{label}</span>}
      <div className="address-row">
        <a
          className="address"
          href={explorer(value)}
          target="_blank"
          rel="noreferrer"
        >
          {value}
          <ExternalLink size={13} />
        </a>
        <button
          className="icon-button"
          type="button"
          aria-label={copied ? "Address copied" : `Copy ${label || "address"}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setError("");
            } catch {
              setError("Copy unavailable. Select the address to copy it.");
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <span role="status" className="hint">
        {error || (copied ? "Copied to clipboard" : "")}
      </span>
    </div>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="external-link">
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="stat">
      <span className="hint">{label}</span>
      <strong>{value}</strong>
      {note && <span className="hint">{note}</span>}
    </div>
  );
}
