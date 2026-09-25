import { useState } from 'react';
import { ChatView } from '@/components/chat/ChatView';
import { generateFingerprint } from '@/lib/utils';

export default function Chat() {
  const [fingerprint] = useState(() => generateFingerprint());

  return (
    <div>
      <ChatView fingerprint={fingerprint} isAdmin={false} />
    </div>
  );
}
