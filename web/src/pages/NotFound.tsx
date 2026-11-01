import { PagePlaceholder } from '../primitives/PagePlaceholder';

export default function NotFound() {
  return <PagePlaceholder title="Page not found" line="That channel does not exist." cta={{ to: '/', label: 'Back to PlayCall' }} />;
}
