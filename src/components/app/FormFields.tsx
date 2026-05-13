import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import {
  controlClassName,
  selectClassName,
  textareaClassName,
  FieldShell,
} from "@/components/app/WorkspaceUI";

export function TextField({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <input {...props} className={`${controlClassName} ${props.className ?? ""}`.trim()} />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <textarea {...props} className={`${textareaClassName} ${props.className ?? ""}`.trim()} />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <select {...props} className={`${selectClassName} ${props.className ?? ""}`.trim()}>
        {children}
      </select>
    </FieldShell>
  );
}

export function SearchField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-muted">
      {label ? <span>{label}</span> : null}
      <input {...props} className={`${controlClassName} ${props.className ?? ""}`.trim()} />
    </label>
  );
}
