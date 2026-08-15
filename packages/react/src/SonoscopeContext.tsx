import type { Sonoscope } from "@sonoscope/core";
import type React from "react";
import { createContext, useContext } from "react";

export const SonoscopeContext = createContext<Sonoscope | null>(null);

export interface SonoscopeProviderProps {
  value: Sonoscope | null;
  children?: React.ReactNode | undefined;
}

export const SonoscopeProvider: React.FC<SonoscopeProviderProps> = ({
  value,
  children,
}) => {
  return (
    <SonoscopeContext.Provider value={value}>
      {children}
    </SonoscopeContext.Provider>
  );
};

export function useSonoscopeContext(): Sonoscope | null {
  return useContext(SonoscopeContext);
}
