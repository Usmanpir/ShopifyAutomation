"use client";

import { createContext, useContext } from "react";

export type NodeIssues = { errors: string[]; warnings: string[] };

export type BuilderContextValue = {
  issues: Map<string, NodeIssues>;
  readOnly: boolean;
  /** Node keys visited by the run being inspected (null = no run highlighted). */
  highlight: Set<string> | null;
};

export const BuilderContext = createContext<BuilderContextValue>({ issues: new Map(), readOnly: false, highlight: null });

export const useBuilder = () => useContext(BuilderContext);
