import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">404</span>
        <h1 className="page__title">Not found</h1>
        <p className="page__sub">
          The memory, decision, or page you're looking for doesn't exist — yet.
        </p>
      </header>
      <p><Link href="/" style={{ textDecoration: 'underline' }}>← Back to overview</Link></p>
    </div>
  );
}
