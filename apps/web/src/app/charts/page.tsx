import { permanentRedirect } from 'next/navigation';

// Charts merged into the combined Markets page (see issue #72). Kept as a
// permanent redirect so existing /charts deep links and bookmarks resolve.
export default function ChartsPage() {
  permanentRedirect('/market');
}
