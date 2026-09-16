export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  if (loading) return <p aria-live="polite">Caricamento…</p>;
  if (error)
    return (
      <div className="inline-notice" role="alert">
        <p>{error}</p>
        <button type="button" className="secondary-button" onClick={retry}>
          Riprova
        </button>
      </div>
    );
  return null;
}
