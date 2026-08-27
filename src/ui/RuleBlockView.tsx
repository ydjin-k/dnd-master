import type { RuleBlock } from "../state/types";
import "./RuleBlockView.css";

export function RuleBlockView({ block }: { block: RuleBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${Math.min(block.level + 1, 6)}` as unknown) as "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag className="rule-block__heading">{block.text}</Tag>;
    }
    case "paragraph":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="rule-block__table-wrap">
          <table>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
