import type { Sonoscope } from "@sonoscope/core";
import type React from "react";
import { createContext, useContext } from "react";
import { type UseSonoscopeOptions, useSonoscope } from "./useSonoscope";

export const SonoscopeContext = createContext<Sonoscope | null>(null);

export type SonoscopeProviderProps =
  | {
      value: Sonoscope | null;
      children?: React.ReactNode | undefined;
    }
  | (UseSonoscopeOptions & {
      value?: undefined;
      children?: React.ReactNode | undefined;
    });

export const SonoscopeProvider: React.FC<SonoscopeProviderProps> = (props) => {
  if ("value" in props && props.value !== undefined) {
    return (
      <SonoscopeContext.Provider value={props.value}>
        {props.children}
      </SonoscopeContext.Provider>
    );
  }

  return (
    <SonoscopeProviderWithOptions
      {...(props as UseSonoscopeOptions & {
        children?: React.ReactNode | undefined;
      })}
    />
  );
};

function SonoscopeProviderWithOptions({
  children,
  ...options
}: UseSonoscopeOptions & { children?: React.ReactNode | undefined }) {
  const { scope } = useSonoscope(options);
  return (
    <SonoscopeContext.Provider value={scope}>
      {children}
    </SonoscopeContext.Provider>
  );
}

export function useSonoscopeContext(): Sonoscope | null {
  return useContext(SonoscopeContext);
}
