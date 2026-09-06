import Link from 'next/link';
import { PageHead } from '@/components/Primitives';

export default function NotFound() {
  return (
    <div>
      <PageHead filing="CEPID · 404" title="Not on file" lede="The memory, agent, or page you asked for is not in this docket." />
      <p>
        <Link href="/">Back to the overview</Link>
      </p>
    </div>
  );
}
