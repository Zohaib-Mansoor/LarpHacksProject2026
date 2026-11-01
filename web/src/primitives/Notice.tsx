export function Notice({ tone = 'info', children }: { tone?: 'info' | 'confirm' | 'danger'; children: React.ReactNode }) {
  return <div className={`notice ${tone === 'info' ? '' : 'notice-' + tone}`}>{children}</div>;
}
