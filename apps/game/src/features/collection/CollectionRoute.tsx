import type { CollectionResponse } from "@fishing/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "../../api/query-keys";
import { LoadingPanel, RetryPanel } from "../chrome/ScreenStatus";
import { CollectionScreen } from "./CollectionScreen";
import type { CollectionMutationApi } from "./mutations";

export type CollectionRouteApi = CollectionMutationApi;

export interface CollectionRouteProps {
  api: CollectionRouteApi;
  navigationRequestId: number;
  onLoaded: (requestId: number) => void;
  onFailed: (requestId: number, message: string) => void;
  onGoFishing: () => void;
}

export function CollectionRoute({ api, navigationRequestId, onLoaded, onFailed, onGoFishing }: CollectionRouteProps) {
  const query = useQuery<CollectionResponse>({
    queryKey: queryKeys.collection,
    queryFn: ({ signal }) => api.getCollection(signal),
    refetchOnWindowFocus: false,
  });
  const settledRequestId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (settledRequestId.current === navigationRequestId || query.isFetching) return;
    if (query.isSuccess) {
      settledRequestId.current = navigationRequestId;
      onLoaded(navigationRequestId);
    } else if (query.isError) {
      settledRequestId.current = navigationRequestId;
      onFailed(navigationRequestId, query.error instanceof Error ? query.error.message : "Unable to open your collection.");
    }
  }, [navigationRequestId, onFailed, onLoaded, query.error, query.isError, query.isFetching, query.isSuccess]);

  const navigationSettled = settledRequestId.current === navigationRequestId;
  if (query.isPending || (!navigationSettled && query.isFetching)) return <LoadingPanel message="Opening your collection…" />;
  if (!query.data) {
    return (
      <RetryPanel
        eyebrow="Could not load that screen"
        message={query.error instanceof Error ? query.error.message : "Unable to open your collection."}
        retryLabel="Try again"
        onRetry={() => void query.refetch()}
        onBack={onGoFishing}
      />
    );
  }
  return <CollectionScreen collection={query.data} api={api} onGoFishing={onGoFishing} />;
}
