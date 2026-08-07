import React, { useState } from 'react';
import { X, Trophy, HelpCircle, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';

interface MusicQuizModalProps {
  onClose: () => void;
}

export const MusicQuizModal: React.FC<MusicQuizModalProps> = ({ onClose }) => {
  const queue = usePlayerStore((s) => s.queue);
  const [score, setScore] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);

  const sampleQuestions = [
    {
      question: 'Which artist sang the track currently in your active player library?',
      options: [queue[0]?.artist || 'Dua Lipa', 'The Weeknd', 'Daft Punk', 'Taylor Swift'],
      correct: 0,
    },
    {
      question: 'What audio format normalization target is standard across modern streaming services?',
      options: ['-6 LUFS', '-14 LUFS', '-24 LUFS', '-30 LUFS'],
      correct: 1,
    },
    {
      question: 'Which Web Audio API node is responsible for 3D positional HRTF audio panning?',
      options: ['BiquadFilterNode', 'GainNode', 'PannerNode', 'ConvolverNode'],
      correct: 2,
    }
  ];

  const currentQ = sampleQuestions[questionIndex % sampleQuestions.length];

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);
    if (idx === currentQ.correct) {
      setScore(score + 100);
    }
  };

  const handleNextQuestion = () => {
    setSelectedOption(null);
    setIsAnswered(false);
    setQuestionIndex(questionIndex + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Music Quiz"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-between items-center pr-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-amber-400">
              <Trophy className="w-5 h-5" /> Music Trivia Challenge
            </h2>
            <p className="text-xs text-neutral-400">Test your knowledge on your library and audio engineering.</p>
          </div>
          <div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-sm font-semibold">
            {score} PTS
          </div>
        </div>

        {/* Question Box */}
        <div className="p-5 rounded-xl bg-black/40 border border-neutral-800 flex flex-col gap-4">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Question {questionIndex + 1}</span>
          <p className="text-base font-medium text-neutral-200">{currentQ.question}</p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-2.5">
          {currentQ.options.map((opt, idx) => {
            let btnStyle = 'bg-neutral-800/60 border-neutral-700 hover:bg-neutral-800 text-neutral-200';
            if (isAnswered) {
              if (idx === currentQ.correct) btnStyle = 'bg-emerald-600/30 border-emerald-500 text-emerald-300';
              else if (selectedOption === idx) btnStyle = 'bg-rose-600/30 border-rose-500 text-rose-300';
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(idx)}
                className={`w-full text-left p-3.5 rounded-xl border text-sm font-medium transition-all flex justify-between items-center ${btnStyle}`}
              >
                <span>{opt}</span>
                {isAnswered && idx === currentQ.correct && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {isAnswered && selectedOption === idx && idx !== currentQ.correct && <XCircle className="w-4 h-4 text-rose-400" />}
              </button>
            );
          })}
        </div>

        {isAnswered && (
          <button
            onClick={handleNextQuestion}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all shadow-lg shadow-amber-500/25"
          >
            Next Question ➔
          </button>
        )}
      </div>
    </div>
  );
};
