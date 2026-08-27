import type { LeaderboardResponse } from "@fishing/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "../../api/query-keys";
import { LoadingPanel, RetryPanel } from "../chrome/ScreenStatus";
import { FriendsScreen } from "./FriendsScreen";

export interface FriendsRouteApi {
  getLeaderboard(signal?: AbortSignal): Promise<LeaderboardResponse>;
}

export interface FriendsRouteProps {
  api: FriendsRouteApi;
  navigationRequestId: number;
  onLoaded: (requestId: number) => void;
  onFailed: (requestId: number, message: string) => void;
  onShare: () => void;
  onGoFishing: () => void;
}

export function FriendsRoute({ api, navigationRequestId, onLoaded, onFailed, onShare, onGoFishing }: FriendsRouteProps) {
  const query = useQuery({
    queryKey: queryKeys.leaderboard,
    queryFn: ({ signal }) => api.getLeaderboard(signal),
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
      onFailed(navigationRequestId, query.error instanceof Error ? query.error.message : "Unable to open the catch board.");
    }
  }, [navigationRequestId, onFailed, onLoaded, query.error, query.isError, query.isFetchedAfterMount, query.isFetching, query.isSuccess]);

  if (query.isPending || query.isFetching) return <LoadingPanel message="Opening the catch board…" />;
  if (query.isError || !query.data) {
    return (
      <RetryPanel
        eyebrow="Could not load that screen"
        message={query.error instanceof Error ? query.error.message : "Unable to open the catch board."}
        retryLabel="Try again"
        onRetry={() => void query.refetch()}
        onBack={onGoFishing}
      />
    );
  }
  return <FriendsScreen leaderboard={query.data} onShare={onShare} onGoFishing={onGoFishing} />;
}
