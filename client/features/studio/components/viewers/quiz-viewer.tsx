"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
    CheckIcon,
    ListChecksIcon,
    RotateCcwIcon,
    TrophyIcon,
    XIcon,
} from "lucide-react";
import type { QuizOutputContent } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { StreamdownContent } from "@/shared/components/streamdown-content";

type QuizQuestion = QuizOutputContent["questions"][number];

type QuizViewerProps = {
    questions: readonly QuizQuestion[];
};

const questionVariants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
};

const staticQuestionVariants = {
    enter: { opacity: 0, x: 0 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 0 },
};

function allIndices(questions: readonly QuizQuestion[]): number[] {
    return questions.map((_question, index) => index);
}

export function QuizViewer({ questions }: QuizViewerProps) {
    const reduceMotion = useReducedMotion() ?? false;
    const [round, setRound] = useState<number[]>(() => allIndices(questions));
    const [position, setPosition] = useState(0);
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [finished, setFinished] = useState(false);
    const [reviewing, setReviewing] = useState(false);

    useEffect(() => {
        setRound(allIndices(questions));
        setPosition(0);
        setAnswers({});
        setFinished(false);
        setReviewing(false);
    }, [questions]);

    const correctIndices = useMemo(
        () =>
            round.filter((index) => {
                const question = questions[index];
                return (
                    question !== undefined &&
                    answers[index] === question.correctIndex
                );
            }),
        [round, answers, questions],
    );
    const incorrectIndices = useMemo(
        () =>
            round.filter(
                (index) =>
                    answers[index] !== undefined &&
                    !correctIndices.includes(index),
            ),
        [round, answers, correctIndices],
    );

    const restart = useCallback(() => {
        setRound(allIndices(questions));
        setPosition(0);
        setAnswers({});
        setFinished(false);
        setReviewing(false);
    }, [questions]);

    const retryIncorrect = useCallback(() => {
        if (incorrectIndices.length === 0) {
            return;
        }
        const retryRound = [...incorrectIndices];
        setAnswers((current) => {
            const next = { ...current };
            for (const index of retryRound) {
                delete next[index];
            }
            return next;
        });
        setRound(retryRound);
        setPosition(0);
        setFinished(false);
        setReviewing(false);
    }, [incorrectIndices]);

    const questionIndex = round[position];
    const question =
        questionIndex === undefined ? undefined : questions[questionIndex];

    if (!question || questionIndex === undefined) {
        return (
            <p className="py-10 text-center text-sm text-muted-foreground">
                This quiz has no questions.
            </p>
        );
    }

    const selected = answers[questionIndex];
    const revealed = selected !== undefined;

    function handleSelect(optionIndex: number) {
        if (questionIndex === undefined || answers[questionIndex] !== undefined) {
            return;
        }
        setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }));
    }

    function nextQuestion() {
        if (position + 1 >= round.length) {
            setFinished(true);
            return;
        }
        setPosition((current) => current + 1);
    }

    if (finished && reviewing) {
        return (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-lg font-semibold">
                        Answer review
                    </h3>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewing(false)}
                    >
                        Back to score
                    </Button>
                </div>

                <ol className="space-y-4">
                    {round.map((index) => {
                        const reviewQuestion = questions[index];
                        if (!reviewQuestion) {
                            return null;
                        }
                        const answer = answers[index];
                        const wasCorrect =
                            answer === reviewQuestion.correctIndex;

                        return (
                            <li
                                key={index}
                                className="rounded-2xl border bg-card p-4"
                            >
                                <div className="flex items-start gap-2">
                                    {wasCorrect ? (
                                        <CheckIcon
                                            aria-hidden
                                            className="mt-0.5 size-4 shrink-0 text-primary"
                                        />
                                    ) : (
                                        <XIcon
                                            aria-hidden
                                            className="mt-0.5 size-4 shrink-0 text-destructive"
                                        />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <StreamdownContent
                                            content={reviewQuestion.question}
                                            className="prose prose-sm dark:prose-invert max-w-none font-medium [&_p]:my-0"
                                        />
                                        <p className="mt-2 text-sm">
                                            <span className="text-muted-foreground">
                                                Your answer:{" "}
                                            </span>
                                            {answer === undefined
                                                ? "Not answered"
                                                : reviewQuestion.options[
                                                      answer
                                                  ]}
                                        </p>
                                        {!wasCorrect ? (
                                            <p className="mt-1 text-sm">
                                                <span className="text-muted-foreground">
                                                    Correct answer:{" "}
                                                </span>
                                                {
                                                    reviewQuestion.options[
                                                        reviewQuestion
                                                            .correctIndex
                                                    ]
                                                }
                                            </p>
                                        ) : null}
                                        <StreamdownContent
                                            content={
                                                reviewQuestion.explanation
                                            }
                                            className="prose prose-sm dark:prose-invert mt-2 max-w-none text-muted-foreground [&_p]:my-0"
                                        />
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        );
    }

    if (finished) {
        const percentage = Math.round(
            (correctIndices.length / round.length) * 100,
        );

        return (
            <motion.div
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                    reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 260, damping: 24 }
                }
                className="mx-auto max-w-lg space-y-5 rounded-3xl border bg-card p-8 text-center"
            >
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15">
                    <TrophyIcon aria-hidden className="size-7 text-primary" />
                </div>

                <div className="space-y-1">
                    <p className="font-heading text-2xl font-semibold">
                        Quiz complete
                    </p>
                    <p className="text-muted-foreground" aria-live="polite">
                        You scored {correctIndices.length} out of {round.length}
                    </p>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: reduceMotion ? 0 : 0.6 }}
                    />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setReviewing(true)}
                    >
                        <ListChecksIcon />
                        Review answers
                    </Button>
                    {incorrectIndices.length > 0 ? (
                        <Button onClick={retryIncorrect}>
                            <RotateCcwIcon />
                            Retry {incorrectIndices.length} missed
                        </Button>
                    ) : null}
                    <Button variant="ghost" onClick={restart}>
                        <RotateCcwIcon />
                        Start over
                    </Button>
                </div>
            </motion.div>
        );
    }

    const progress = (position / round.length) * 100;

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="tabular-nums">
                        Question {position + 1} of {round.length}
                    </span>
                    <span className="tabular-nums">
                        {correctIndices.length} correct
                    </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                        className="h-full rounded-full bg-primary"
                        animate={{ width: `${progress}%` }}
                        transition={
                            reduceMotion
                                ? { duration: 0 }
                                : { type: "spring", stiffness: 220, damping: 30 }
                        }
                    />
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={`${questionIndex}-${position}`}
                    variants={
                        reduceMotion ? staticQuestionVariants : questionVariants
                    }
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: reduceMotion ? 0 : 0.22 }}
                    className="space-y-4"
                >
                    <StreamdownContent
                        content={question.question}
                        className="prose prose-sm dark:prose-invert max-w-none font-heading text-lg font-semibold [&_p]:my-0"
                    />

                    <div className="grid gap-2">
                        {question.options.map((option, optionIndex) => {
                            const isSelected = selected === optionIndex;
                            const isCorrect =
                                optionIndex === question.correctIndex;

                            const stateClass = !revealed
                                ? "border-border hover:border-primary/50 hover:bg-muted/50"
                                : isCorrect
                                  ? "border-primary bg-primary/10"
                                  : isSelected
                                    ? "border-destructive bg-destructive/10"
                                    : "border-border opacity-55";

                            return (
                                <button
                                    key={optionIndex}
                                    type="button"
                                    disabled={revealed}
                                    onClick={() => handleSelect(optionIndex)}
                                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${stateClass}`}
                                >
                                    <span
                                        className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                                            revealed && isCorrect
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : revealed && isSelected
                                                  ? "border-destructive bg-destructive text-white"
                                                  : "border-border text-muted-foreground"
                                        }`}
                                    >
                                        {revealed && isCorrect ? (
                                            <CheckIcon
                                                aria-hidden
                                                className="size-3.5"
                                            />
                                        ) : revealed && isSelected ? (
                                            <XIcon
                                                aria-hidden
                                                className="size-3.5"
                                            />
                                        ) : (
                                            String.fromCharCode(
                                                65 + optionIndex,
                                            )
                                        )}
                                    </span>
                                    <span className="flex-1">{option}</span>
                                    {revealed && isCorrect ? (
                                        <span className="sr-only">
                                            Correct answer
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </motion.div>
            </AnimatePresence>

            {revealed ? (
                <div
                    role="status"
                    className="space-y-3 rounded-2xl border bg-muted/30 p-4"
                >
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                        {selected === question.correctIndex
                            ? "Correct"
                            : "Not quite"}
                    </p>
                    <StreamdownContent
                        content={question.explanation}
                        className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-0 [&_p+p]:mt-2"
                    />
                    <Button size="sm" onClick={nextQuestion}>
                        {position + 1 >= round.length
                            ? "See score"
                            : "Next question"}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
