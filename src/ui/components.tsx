import { useLocale } from "./locale";
import { t, translateMessage } from "../shared/i18n";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconChevronRight } from "@tabler/icons-react";

export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  help,
  className = "",
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  help?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <label className={`switch ${className}`} htmlFor={id}>
      <span className="copy">
        <span className={help ? "help-label" : undefined}>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        data-help={help}
        aria-label={typeof label === "string" ? label : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" aria-hidden="true" />
    </label>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  tall = false,
  help,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  tall?: boolean;
  help?: string;
}) {
  const name = useId();
  return (
    <div
      className={`seg ${tall ? "tall" : ""}`}
      role="radiogroup"
      aria-label={label}
      data-help={help}
    >
      {options.map((o) => (
        <label key={String(o.value)}>
          <input
            type="radio"
            name={name}
            value={String(o.value)}
            checked={o.value === value}
            disabled={disabled || o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span>
            {o.label}
            {o.hint && <small>{o.hint}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
  help,
  format = (v) => `${Math.round(v * 100)}%`,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  help?: string;
  format?: (value: number) => string;
}) {
  const id = useId();
  const percent = ((value - min) / (max - min)) * 100,
    origin = min < 0 ? ((0 - min) / (max - min)) * 100 : 0;
  return (
    <div className="slider">
      <div className="head">
        <label htmlFor={id} className={help ? "help-label" : undefined}>
          {label}
        </label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-help={help}
        aria-valuetext={format(value)}
        style={
          {
            "--lo": `${Math.min(origin, percent)}%`,
            "--hi": `${Math.max(origin, percent)}%`,
          } as React.CSSProperties
        }
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Disclosure({
  summary,
  value,
  children,
  open,
}: {
  summary: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="disclosure" open={open}>
      <summary>
        <IconChevronRight className="chev" size={16} stroke={1.8} aria-hidden="true" />
        <span>{summary}</span>
        {value && <span className="summary-value">{value}</span>}
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}

interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
const ConfirmContext = createContext<
  (request: Omit<ConfirmRequest, "resolve">) => Promise<boolean>
>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);
/** A native modal dialog for decisions that revoke access or replace data. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [request, setRequest] = useState<ConfirmRequest>();
  const dialog = useRef<HTMLDialogElement>(null);
  const ask = useCallback(
    (r: Omit<ConfirmRequest, "resolve">) =>
      new Promise<boolean>((resolve) => setRequest({ ...r, resolve })),
    [],
  );
  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal();
  }, [request]);
  const finish = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(undefined);
    dialog.current?.close();
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="confirm-title"
        onCancel={(e) => {
          e.preventDefault();
          finish(false);
        }}
      >
        {request && (
          <>
            <h2 id="confirm-title">{request.title}</h2>
            <div>{request.body}</div>
            <div className="actions">
              <button className="btn quiet" autoFocus onClick={() => finish(false)}>
                {t("Cancel")}</button>
              <button
                className={`btn ${request.danger ? "danger" : "primary"}`}
                onClick={() => finish(true)}
              >
                {request.confirm}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
export function Feedback({
  error,
  notice,
  compact = false,
}: {
  error: string;
  notice: string;
  compact?: boolean;
}) {
  useLocale();
  return (
    <div className="feedback" aria-live="polite">
      {error ? (
        <p className="message error" role="alert" tabIndex={0}>
          {compact && error.length > 140
            ? t("That did not work. Open Settings → Diagnostics for the full error.")
            : translateMessage(error)}
        </p>
      ) : notice ? (
        <p className="message success">{translateMessage(notice)}</p>
      ) : null}
    </div>
  );
}
export function Shortcut({ keys }: { keys: string }) {
  if (!keys) return null;
  const parts = keys.split("+");
  return (
    <span className="shortcut">
      {parts.map((k, i) => (
        <React.Fragment key={k + i}>
          {i > 0 && "+"}
          <kbd>{k}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}
