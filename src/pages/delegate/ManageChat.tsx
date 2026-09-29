import { ChatView } from '@/components/chat/ChatView';
import { ChatDayDelete } from '@/components/delegate/ChatDayDelete';

export default function ManageChat() {
  return (
    <div className="space-y-3">
      <ChatDayDelete />
      <ChatView fingerprint={null} isAdmin />
    </div>
  );
}
