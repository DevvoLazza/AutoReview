"use client";
import type { ReviewCase } from "@reviewguard/contracts";
import { useResource } from "@/lib/use-resource";
import { ResourceState } from "./resource-state";
import { ReviewWorkbench } from "./review-workbench";
export function ReviewDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useResource<ReviewCase>(
    `/reviews/${encodeURIComponent(id)}`,
  );
  return (
    <>
      <ResourceState loading={loading} error={error} retry={refresh} />
      {data && !loading && !error && (
        <ReviewWorkbench key={`${data.id}/${data.version}`} initial={data} />
      )}
    </>
  );
}
