// Tarjetas y apuntes en Markdown con fórmulas (KaTeX). Se carga aparte, solo al abrir Academy.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { blockMath } from './logic';

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{blockMath(text)}</ReactMarkdown>
    </div>
  );
}
