"use client";

import { useReducer, type ReactNode } from "react";
import { AppContext, appReducer, initialState } from "@/lib/store";

export default function Providers({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext value={{ state, dispatch }}>
      {children}
    </AppContext>
  );
}
