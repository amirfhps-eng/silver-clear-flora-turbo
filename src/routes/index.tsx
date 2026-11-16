import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/chess/Studio";

export const Route = createFileRoute("/")({ component: Studio });
