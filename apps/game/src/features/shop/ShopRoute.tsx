import type { GameStateResponse, PurchaseRequest, PurchaseResponse } from "@fishing/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "../../api/query-keys";
import { LoadingPanel, RetryPanel } from "../chrome/ScreenStatus";
import { ShopScreen } from "./ShopScreen";

export interface ShopRouteApi {
  getGameState(signal?: AbortSignal): Promise<GameStateResponse>;
  purchase(input: PurchaseRequest): Promise<PurchaseResponse>;
}

export interface ShopRouteProps {
  api: ShopRouteApi;
  navigationRequestId: number;
  onLoaded: (requestId: number) => void;
  onFailed: (requestId: number, message: string) => void;
}

export function ShopRoute({ api, navigationRequestId, onLoaded, onFailed }: ShopRouteProps) {
  const query = useQuery({
    queryKey: queryKeys.gameState,
    queryFn: ({ signal }) => api.getGameState(signal),
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
      onFailed(navigationRequestId, query.error instanceof Error ? query.error.message : "Unable to open the tackle shop.");
    }
  }, [navigationRequestId, onFailed, onLoaded, query.error, query.isError, query.isFetching, query.isSuccess]);

  const navigationSettled = settledRequestId.current === navigationRequestId;
  if (query.isPending || (!navigationSettled && query.isFetching)) return <LoadingPanel message="Opening the tackle shop…" />;
  if (!query.data) {
    return (
      <RetryPanel
        eyebrow="Could not load that screen"
        message={query.error instanceof Error ? query.error.message : "Unable to open the tackle shop."}
        retryLabel="Try again"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ShopScreen state={query.data} api={api} />;
}
