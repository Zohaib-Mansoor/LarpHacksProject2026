export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty-state"><h2 style={{ fontSize: 'var(--fs-19)', marginBottom: 'var(--sp-2)' }}>{title}</h2>{children}</div>;
}
