import { useEffect, useState } from 'react';
import { useReducedMotion } from '../hooks/motion';

/** The questions a student actually asks themselves, typed out one at a time. */
const QUESTIONS = [
  'What do I need on the final to keep my A?',
  'Which class can I relax on the most?',
  'Is this homework even worth doing?',
  'If I bomb this quiz, am I still fine?',
  'Where should tonight actually go?',
  "What's the least I can do and still get an A?",
  'Am I on track, or am I fooling myself?',
  'Which one of these is already decided?',
];

const TYPE_MS = 42;
const DELETE_MS = 22;
const HOLD_MS = 1900;

export function QuestionCarousel() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [len, setLen] = useState(0);
  const [erasing, setErasing] = useState(false);

  const full = QUESTIONS[i] ?? '';

  useEffect(() => {
    if (reduced) return;
    let t: number;
    if (!erasing && len < full.length) {
      t = window.setTimeout(() => setLen(len + 1), TYPE_MS);
    } else if (!erasing && len === full.length) {
      t = window.setTimeout(() => setErasing(true), HOLD_MS);
    } else if (erasing && len > 0) {
      t = window.setTimeout(() => setLen(len - 1), DELETE_MS);
    } else {
      t = window.setTimeout(() => {
        setErasing(false);
        setI((n) => (n + 1) % QUESTIONS.length);
      }, 120);
    }
    return () => clearTimeout(t);
  }, [len, erasing, full, reduced]);

  // No typing under reduced motion — just cycle the full question slowly.
  useEffect(() => {
    if (!reduced) return;
    const t = window.setInterval(
      () => setI((n) => (n + 1) % QUESTIONS.length), 4200);
    return () => clearInterval(t);
  }, [reduced]);

  const shown = reduced ? full : full.slice(0, len);

  return (
    <p className="carousel" aria-live="polite">
      <span className="qmark" aria-hidden="true">“</span>
      <span className="qtext">{shown}</span>
      <span className={`caret${reduced ? ' still' : ''}`} aria-hidden="true" />
    </p>
  );
}
