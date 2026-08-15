"use client";

import type { FaqOutputContent } from "@homeworkcopy/contracts";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { StreamdownContent } from "@/shared/components/streamdown-content";

type FaqViewerProps = {
    items: FaqOutputContent["items"];
};

export function FaqViewer({ items }: FaqViewerProps) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground tabular-nums">
                {items.length} question{items.length === 1 ? "" : "s"}
            </p>
            <Accordion className="w-full">
                {items.map((item, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                        <AccordionTrigger className="text-left text-sm font-medium">
                            {item.question}
                        </AccordionTrigger>
                        <AccordionContent>
                            <StreamdownContent
                                content={item.answer}
                                mode="static"
                                className="prose prose-sm dark:prose-invert max-w-none"
                            />
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}
