import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { ScreenId } from "./app-types";
import { LoadingPanel, RetryPanel } from "../features/chrome/ScreenStatus";

export type LazyFeatureLoader<Props extends object> = () => Promise<{ default: ComponentType<Props> }>;

export interface LazyFeatureRouteProps<Props extends object> {
  label: string;
  load: LazyFeatureLoader<Props>;
  props: Props;
  screen: ScreenId;
  requestId: number;
  onLoadFailed: (requestId: number, message: string) => void;
  onBack?: () => void;
}

function errorMessage(error: unknown, label: string): string {
  if (error instanceof Error && error.message) return error.message;
  return `Unable to load ${label.toLowerCase()}.`;
}

/**
 * Loads a feature module only when its navigation request renders it. The
 * request key is owned by App so an abandoned navigation cannot commit a
 * resolved module into a newer screen.
 */
export function LazyFeatureRoute<Props extends object>({ label, load, props, screen, requestId, onLoadFailed, onBack }: LazyFeatureRouteProps<Props>) {
  const [component, setComponent] = useState<ComponentType<Props> | undefined>(undefined);
  const [loadError, setLoadError] = useState<Error | undefined>(undefined);
  const generationRef = useRef(0);
  const reportedFailureRef = useRef<number | undefined>(undefined);

  const loadFeature = useCallback(() => {
    const generation = ++generationRef.current;
    reportedFailureRef.current = undefined;
    setComponent(undefined);
    setLoadError(undefined);
    void load().then(
      (module) => {
        if (generation !== generationRef.current) return;
        setComponent(() => module.default);
      },
      (error: unknown) => {
        if (generation !== generationRef.current) return;
        setLoadError(error instanceof Error ? error : new Error(errorMessage(error, label)));
      },
    );
  }, [label, load]);

  useEffect(() => {
    loadFeature();
    return () => {
      generationRef.current += 1;
    };
  }, [loadFeature]);

  useEffect(() => {
    if (!loadError || reportedFailureRef.current === generationRef.current) return;
    reportedFailureRef.current = generationRef.current;
    onLoadFailed(requestId, errorMessage(loadError, label));
  }, [label, loadError, onLoadFailed, requestId, screen]);

  if (loadError) {
    return (
      <RetryPanel
        eyebrow="Screen unavailable"
        message={errorMessage(loadError, label)}
        retryLabel={`Retry ${label.toLowerCase()}`}
        onRetry={loadFeature}
        onBack={onBack}
      />
    );
  }
  if (!component) return <LoadingPanel message={`Loading ${label.toLowerCase()}…`} />;
  const LoadedComponent = component;
  return <LoadedComponent {...props} />;
}
