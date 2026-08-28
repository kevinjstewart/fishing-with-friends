import type { FishJournalResponse, GameStateResponse } from "@fishing/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "../../api/query-keys";
import { LoadingPanel, RetryPanel } from "../chrome/ScreenStatus";
import { JournalScreen } from "./JournalScreen";

export interface JournalRouteApi {
  getJournal(signal?: AbortSignal): Promise<FishJournalResponse>;
}

export interface JournalRouteProps {
  api: JournalRouteApi;
  state: GameStateResponse;
  navigationRequestId: number;
  onLoaded: (requestId: number) => void;
  onFailed: (requestId: number, message: string) => void;
  onGoFishing: () => void;
}

export function JournalRoute({ api, state, navigationRequestId, onLoaded, onFailed, onGoFishing }: JournalRouteProps) {
  const query = useQuery({
    queryKey: queryKeys.journal,
    queryFn: ({ signal }) => api.getJournal(signal),
    refetchOnWindowFocus: false,
  });
  const settledRequestId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (settledRequestId.current === navigationRequestId || !query.isFetchedAfterMount || query.isFetching) return;
    if (query.isSuccess) {
      settledRequestId.current = navigationRequestId;
      onLoaded(navigationRequestId);
    } else if (query.isError) {
      settledRequestId.current = navigationRequestId;
      onFailed(navigationRequestId, query.error instanceof Error ? query.error.message : "Unable to open your fish journal.");
    }
  }, [navigationRequestId, onFailed, onLoaded, query.error, query.isError, query.isFetchedAfterMount, query.isFetching, query.isSuccess]);

  if (query.isPending || query.isFetching) return <LoadingPanel message="Opening your fish journal…" />;
  if (query.isError || !query.data) {
    return (
      <RetryPanel
        eyebrow="Could not load that screen"
        message={query.error instanceof Error ? query.error.message : "Unable to open your fish journal."}
        retryLabel="Try again"
        onRetry={() => void query.refetch()}
        onBack={onGoFishing}
      />
    );
  }
  return <JournalScreen journal={query.data} state={state} onGoFishing={onGoFishing} />;
}
