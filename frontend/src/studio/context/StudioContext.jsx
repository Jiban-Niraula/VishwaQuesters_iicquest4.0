import React, { createContext, useContext } from "react";
import { useStudioState } from "../hooks/useStudioState";

const StudioContext = createContext();

export function StudioProvider({ children }) {
  const state = useStudioState();
  return (
    <StudioContext.Provider value={state}>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error("useStudio must be used within a StudioProvider");
  }
  return context;
}
