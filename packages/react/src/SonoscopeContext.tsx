import type { Sonoscope } from "@sonoscope/core";
import type React from "react";
import { createContext, useContext } from "react";
import { type UseSonoscopeOptions, useSonoscope } from "./useSonoscope";

/**
 * React context holding the active Sonoscope coordinator instance.
 */
export const SonoscopeContext = createContext<Sonoscope | null>(null);

/**
 * Props for the `SonoscopeProvider` component.
 * Accepts either an existing `Sonoscope` instance as `value` or direct `useSonoscope` configuration options.
 */
export type SonoscopeProviderProps =
  | {
      value: Sonoscope | null;
      children?: React.ReactNode | undefined;
    }
  | (UseSonoscopeOptions & {
      value?: undefined;
      children?: React.ReactNode | undefined;
    });

/**
 * Provides a Sonoscope coordinator instance to child components.
 */
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

/**
 * Returns the current Sonoscope coordinator from the nearest SonoscopeProvider.
 */
export function useSonoscopeContext(): Sonoscope | null {
  return useContext(SonoscopeContext);
}
