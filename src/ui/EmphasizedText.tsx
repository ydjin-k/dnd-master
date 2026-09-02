import type { ReactNode } from "react";

/**
 * Выделяет название термина в строках SRD вида «Название: описание» и
 * «Название. Описание». Данные остаются единственным владельцем текста —
 * компонент меняет только представление.
 */
export function EmphasizedText({ children }: { children: string }): ReactNode {
  const colon = children.indexOf(":");
  const period = children.indexOf(".");
  const candidates = [colon, period].filter((index) => index > 0 && index <= 80);
  const separator = candidates.length > 0 ? Math.min(...candidates) : -1;

  if (separator === -1) return children;

  return (
    <>
      <strong>{children.slice(0, separator)}</strong>
      {children.slice(separator)}
    </>
  );
}
