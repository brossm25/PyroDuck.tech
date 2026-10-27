import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const playbook = defineCollection({
  loader: glob({
    base: "./src/content/playbook",
    pattern: "**/*.md",
  }),
  schema: z.object({
    title: z.string(),
    category: z.string(),
    course: z.string(),
    tags: z.array(z.string()),
  }),
});

export const collections = { playbook };
