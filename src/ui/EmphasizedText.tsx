import type { ReactNode } from "react";

/**
 * Выделяет название термина в строках SRD вида «Название: описание» и
 * «Название. Описание». Данные остаются единственным владельцем текста —
 * компонент меняет только представление.
 */
export function EmphasizedText({ children }: { children: string }): ReactNode {
  const colon = children.indexOf(":");
  const period = children.indexOf(".");
  const separator = colon > 0 && colon <= 80 ? colon : period > 0 && period <= 80 ? period : -1;

  if (separator === -1) return children;

  return (
    <>
      <strong>{children.slice(0, separator)}</strong>
      {children.slice(separator)}
    </>
  );
}
